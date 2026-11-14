// Call attempt state machine: one place that decides where a phone call is and
// what it ended as, and that writes the attempt into the calls DB exactly once.
//
// Twilio reports a call through several channels that arrive in no guaranteed
// order and not always at all (Connect action, StatusCallback, stream status,
// websocket close). Each of them funnels into applyParams()/noteOutcome() here;
// the first terminal signal wins and everything later is ignored, so a call
// never produces two history rows.

import {
  OUTCOME,
  outcomeFromParams,
  isTerminalOutcome,
  statusForOutcome,
  twilioErrorHint,
  outcomeLabel
} from '../utils/phone.js';

const RETENTION_MS = 30 * 60 * 1000; // finished attempts stay queryable
const MAX_RETAINED = 200;
const WATCHDOG_GRACE_MS = 2 * 60 * 1000;

// createCallLifecycle options:
//   db            call store — every save is `db.saveCall(userId, record)`
//   resolveUserId owner for a call that arrives with no session to attribute it
//                 to (an inbound Twilio call), or null to keep it unowned
export function createCallLifecycle({ db, summarize, config = () => ({}), resolveUserId = () => null, log = () => {} } = {}) {
  const attempts = new Map(); // callSid -> attempt

  function now() { return Date.now(); }

  function hasCapacity() {
    const { maxConcurrentCalls } = config();
    if (!maxConcurrentCalls) return true;
    return activeCount() < maxConcurrentCalls;
  }

  function activeCount() {
    let n = 0;
    for (const a of attempts.values()) if (!a.terminal) n++;
    return n;
  }

  function startAttempt(fields = {}) {
    const callSid = fields.callSid || `local-${now()}-${Math.floor(Math.random() * 1e6)}`;
    const existing = attempts.get(callSid);
    if (existing) return existing;

    const attempt = {
      callSid,
      // Whose workspace this call lands in. An outbound dial carries the signed-in
      // user; an inbound call has no session, so it takes the default account.
      userId: fields.userId || resolveUserId() || null,
      mode: fields.mode || 'live-phone',
      channel: 'phone',
      direction: fields.direction || 'outbound',
      from: fields.from || '',
      to: fields.to || '',
      customerName: fields.customerName || null,
      company: fields.company || null,
      productKey: fields.productKey || null,
      product: fields.product || null,
      language: fields.language || 'English',
      state: OUTCOME.QUEUED,
      outcome: null,
      terminal: false,
      persisted: false,
      callId: null,
      startedAt: fields.startedAt || now(),
      connectedAt: null,
      endedAt: null,
      twilioDuration: null,
      errorCode: fields.errorCode ?? null,
      errorMessage: fields.errorMessage || null,
      streamSid: null,
      recordingUrl: null,
      session: null,
      watchdog: null,
      events: []
    };
    attempts.set(callSid, attempt);
    armWatchdog(attempt);
    prune();
    return attempt;
  }

  function armWatchdog(attempt) {
    const { maxCallMinutes = 15 } = config();
    const ms = Math.max(1, maxCallMinutes) * 60000 + WATCHDOG_GRACE_MS;
    attempt.watchdog = setTimeout(() => {
      if (attempt.terminal) return;
      log(`no terminal signal for ${attempt.callSid} after ${Math.round(ms / 1000)}s — closing as unknown`);
      finalize(attempt.callSid, OUTCOME.UNKNOWN, 'watchdog').catch((err) => log(`watchdog finalize failed: ${err.message}`));
    }, ms);
    attempt.watchdog.unref?.();
  }

  // Accept any Twilio callback body. Resolves with the attempt it applied to.
  async function applyParams(params = {}, meta = {}) {
    const callSid = params.CallSid || params.callSid || params.ParentCallSid || meta.callSid || null;
    const attempt = callSid && attempts.get(callSid)
      ? attempts.get(callSid)
      : startAttempt({
          callSid,
          direction: normalizeDirection(params.Direction || params.direction || meta.direction),
          from: params.From || params.from || '',
          to: params.To || params.to || ''
        });

    if (params.From) attempt.from = params.From;
    if (params.To) attempt.to = params.To;
    if (params.CallDuration !== undefined && params.CallDuration !== '') {
      const d = Number(params.CallDuration);
      if (Number.isFinite(d)) attempt.twilioDuration = d;
    }
    if (params.ErrorCode) attempt.errorCode = Number(params.ErrorCode) || params.ErrorCode;
    if (params.ErrorMessage) attempt.errorMessage = params.ErrorMessage;
    if (params.ErrorMoreInfo && !attempt.errorMessage) attempt.errorMessage = params.ErrorMoreInfo;
    if (params.CallSid && !attempt.callSid) attempt.callSid = params.CallSid;

    attempt.events.push({ at: now(), source: meta.source || 'callback', status: params.CallStatus || params.ConnectStatus || params.DialCallStatus || null });

    const outcome = outcomeFromParams(params);
    if (outcome === OUTCOME.COMPLETED || outcome === OUTCOME.ACTIVE) {
      attempt.connectedAt = attempt.connectedAt || now();
    }

    if (isTerminalOutcome(outcome)) {
      return finalize(attempt.callSid, outcome, meta.source || 'callback');
    }
    attempt.state = outcome;
    return attempt;
  }

  function normalizeDirection(dir) {
    const d = String(dir || '').toLowerCase();
    if (d.includes('inbound')) return 'inbound';
    if (d.includes('outbound')) return 'outbound';
    return 'outbound';
  }

  // A websocket can present several identities (dial token, TwiML parameter,
  // real CallSid) in an order nobody guarantees, so resolution tries each.
  function resolve(keys) {
    for (const key of [].concat(keys || [])) {
      if (key && attempts.has(key)) return attempts.get(key);
    }
    return null;
  }

  function bindSession(keys, session) {
    const attempt = resolve(keys);
    if (!attempt) return null;
    attempt.session = session;
    if (session && typeof session.streamSid === 'string') attempt.streamSid = session.streamSid;
    return attempt;
  }

  // Outbound dials are registered under a token before Twilio assigns a CallSid;
  // once the REST response arrives the attempt adopts the real id so every later
  // callback (keyed by CallSid) resolves to the same attempt.
  function rekey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return attempts.get(newKey) || attempts.get(oldKey) || null;
    const attempt = attempts.get(oldKey);
    if (!attempt) return attempts.get(newKey) || null;
    attempt.callSid = newKey;
    attempts.delete(oldKey);
    attempts.set(newKey, attempt);
    return attempt;
  }

  const get = resolve;

  function noteConnected(keys) {
    const attempt = resolve(keys);
    if (!attempt || attempt.terminal) return attempt;
    attempt.connectedAt = attempt.connectedAt || now();
    attempt.state = OUTCOME.ACTIVE;
    return attempt;
  }

  function noteOutcome(keys, outcome, source = 'app') {
    const attempt = resolve(keys);
    if (!attempt || attempt.terminal) return attempt || null;
    if (!isTerminalOutcome(outcome)) {
      attempt.state = outcome;
      return attempt;
    }
    return finalize(keys, outcome, source);
  }

  async function finalize(keys, outcome, source = 'unknown') {
    const attempt = resolve(keys);
    if (!attempt) return null;
    if (attempt.terminal) return attempt;

    attempt.terminal = true;
    attempt.outcome = outcome || OUTCOME.UNKNOWN;
    attempt.state = attempt.outcome;
    attempt.endedAt = now();
    if (attempt.watchdog) {
      clearTimeout(attempt.watchdog);
      attempt.watchdog = null;
    }

    try {
      await persist(attempt, source);
    } catch (err) {
      log(`persist failed for ${attempt.callSid}: ${err.message}`);
    }
    return attempt;
  }

  async function persist(attempt, source) {
    if (attempt.persisted) return;
    attempt.persisted = true;

    const transcript = attempt.session && typeof attempt.session.getTranscript === 'function'
      ? attempt.session.getTranscript()
      : [];
    const conversation = transcript.filter((m) => m && m.text).length > 1;
    const durationSec = attempt.twilioDuration != null
      ? attempt.twilioDuration
      : attempt.connectedAt
        ? Math.round((attempt.endedAt - attempt.connectedAt) / 1000)
        : 0;

    let summary = emptySummary(attempt);
    let status = statusForOutcome(attempt.outcome) || 'No Response';

    if (conversation && summarize) {
      try {
        summary = await summarize({
          transcript,
          product: attempt.product || 'DevPulse AI',
          apiKey: null
        });
        status = summary.status || status;
      } catch (err) {
        log(`summarize failed for ${attempt.callSid}: ${err.message}`);
      }
    }

    const record = {
      // Stable id: a second attempt to persist the same Twilio call can never
      // create a duplicate history row.
      id: `call-phone-${attempt.callSid}`,
      userId: attempt.userId || null,
      channel: 'phone',
      mode: attempt.mode,
      direction: attempt.direction,
      callSid: attempt.callSid,
      from: attempt.from,
      to: attempt.to,
      customerName: attempt.customerName || (attempt.from || 'Phone prospect'),
      company: attempt.company || '—',
      product: attempt.product || 'DevPulse AI',
      language: attempt.language,
      timestamp: new Date(attempt.startedAt).toISOString(),
      duration: durationSec,
      outcome: attempt.outcome,
      outcomeLabel: outcomeLabel(attempt.outcome),
      terminalSource: source,
      twilioErrorCode: attempt.errorCode ?? null,
      twilioErrorMessage: attempt.errorMessage || null,
      twilioErrorHint: twilioErrorHint(attempt.errorCode) || null,
      connectedAt: attempt.connectedAt ? new Date(attempt.connectedAt).toISOString() : null,
      endedAt: attempt.endedAt ? new Date(attempt.endedAt).toISOString() : null,
      status,
      transcript,
      summary,
      recordingUrl: attempt.recordingUrl || null
    };

    if (!db) {
      log(`no db injected — call ${attempt.callSid} not persisted`);
      return;
    }
    const owner = attempt.userId || resolveUserId();
    if (!owner) {
      log(`call ${attempt.callSid} has no owner and no default account — not persisted`);
      return;
    }
    const saved = db.saveCall(owner, record);
    attempt.userId = owner;
    attempt.callId = saved.id;
    log(`attempt ${attempt.callSid} persisted outcome=${attempt.outcome} status=${status} turns=${transcript.length} src=${source}`);
  }

  function emptySummary(attempt) {
    return {
      overview: `Call attempt ended as "${outcomeLabel(attempt.outcome || OUTCOME.UNKNOWN)}" before any conversation took place.`,
      requirements: [],
      objections: [],
      nextSteps: ['Retry this number at a different time'],
      sentiment: 'Neutral',
      dealScore: 0
    };
  }

  function prune() {
    if (attempts.size <= MAX_RETAINED) return;
    const cutoff = now() - RETENTION_MS;
    for (const [sid, a] of attempts) {
      if (a.terminal && a.endedAt < cutoff) attempts.delete(sid);
    }
    // Still over the cap: drop the oldest finished attempts.
    if (attempts.size > MAX_RETAINED) {
      const finished = [...attempts.values()]
        .filter((a) => a.terminal)
        .sort((x, y) => (x.endedAt || 0) - (y.endedAt || 0));
      for (const a of finished.slice(0, attempts.size - MAX_RETAINED)) attempts.delete(a.callSid);
    }
  }

  // Attempts are process-wide (Twilio callbacks address them by CallSid), but a
  // caller may only list its own. Without a userId this returns everything, which
  // is used by internal diagnostics only — never by a route handler.
  function list({ activeOnly = false, userId = null } = {}) {
    let all = [...attempts.values()];
    if (userId) all = all.filter((a) => (a.userId || null) === userId);
    all.sort((a, b) => b.startedAt - a.startedAt);
    return activeOnly ? all.filter((a) => !a.terminal) : all;
  }

  function snapshot(attempt) {
    if (!attempt) return null;
    const transcript = attempt.session && typeof attempt.session.getTranscript === 'function'
      ? attempt.session.getTranscript()
      : [];
    const runningMs = attempt.terminal
      ? (attempt.endedAt || attempt.startedAt) - attempt.startedAt
      : now() - attempt.startedAt;
    return {
      callSid: attempt.callSid,
      callId: attempt.callId,
      mode: attempt.mode,
      direction: attempt.direction,
      from: attempt.from,
      to: attempt.to,
      customerName: attempt.customerName,
      product: attempt.product,
      state: attempt.state,
      outcome: attempt.outcome,
      outcomeLabel: outcomeLabel(attempt.outcome || attempt.state),
      terminal: attempt.terminal,
      live: Boolean(attempt.session),
      startedAt: new Date(attempt.startedAt).toISOString(),
      connectedAt: attempt.connectedAt ? new Date(attempt.connectedAt).toISOString() : null,
      endedAt: attempt.endedAt ? new Date(attempt.endedAt).toISOString() : null,
      // Twilio's billed duration is authoritative once we have it; until then the
      // UI shows elapsed wall-clock time from the dial.
      durationSec: attempt.twilioDuration != null
        ? attempt.twilioDuration
        : Math.max(0, Math.round(runningMs / 1000)),
      turns: transcript.length,
      transcript,
      recordingUrl: attempt.recordingUrl || null,
      errorCode: attempt.errorCode ?? null,
      errorMessage: attempt.errorMessage || null,
      errorHint: twilioErrorHint(attempt.errorCode) || null,
      events: attempt.events.slice(-8)
    };
  }

  function stop() {
    for (const a of attempts.values()) {
      if (a.watchdog) clearTimeout(a.watchdog);
    }
    attempts.clear();
  }

  return {
    startAttempt,
    applyParams,
    bindSession,
    rekey,
    noteConnected,
    noteOutcome,
    finalize,
    get,
    list,
    snapshot,
    activeCount,
    hasCapacity,
    stop
  };
}
