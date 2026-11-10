// Phone-number validation and the Twilio -> app call-outcome taxonomy.
// Kept free of I/O so both the API layer and the tests can use it directly.

const E164 = /^\+[1-9]\d{6,14}$/;

export function isValidE164(value) {
  return typeof value === 'string' && E164.test(value.trim());
}

// Accepts what a user actually types (spaces, dashes, parentheses, a leading 00
// international prefix) and returns E.164, which is what Twilio requires.
// Returns null when the result is not a plausible international number: we never
// guess a country code, because guessing wrong places a call to somebody else.
export function normalizeE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) return null;
  s = s.replace(/[^\d+]/g, '');
  return isValidE164(s) ? s : null;
}

// App-level outcomes. Terminal ones end a call attempt; the rest are live states
// the UI shows while a call is progressing.
export const OUTCOME = {
  QUEUED: 'queued',
  RINGING: 'ringing',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  BUSY: 'busy',
  NO_ANSWER: 'no-answer',
  CANCELED: 'canceled',
  REJECTED: 'rejected',
  NOT_CALLABLE: 'not-callable',
  FAILED: 'failed',
  UNKNOWN: 'unknown'
};

const TERMINAL = new Set([
  OUTCOME.COMPLETED, OUTCOME.BUSY, OUTCOME.NO_ANSWER, OUTCOME.CANCELED,
  OUTCOME.REJECTED, OUTCOME.NOT_CALLABLE, OUTCOME.FAILED, OUTCOME.UNKNOWN
]);

export const isTerminalOutcome = (outcome) => TERMINAL.has(outcome);

// Twilio spells the same state differently depending on which callback fired
// (CallStatus on the REST/status callback, ConnectStatus on the <Connect action>,
// DialCallStatus on <Dial>), so normalize every spelling we can see.
const STATUS_MAP = {
  queued: OUTCOME.QUEUED,
  initiated: OUTCOME.QUEUED,
  ringing: OUTCOME.RINGING,
  'in-progress': OUTCOME.ACTIVE,
  in_progress: OUTCOME.ACTIVE,
  answering: OUTCOME.ACTIVE,
  answered: OUTCOME.COMPLETED,
  completed: OUTCOME.COMPLETED,
  busy: OUTCOME.BUSY,
  'no-answer': OUTCOME.NO_ANSWER,
  noanswer: OUTCOME.NO_ANSWER,
  'no answer': OUTCOME.NO_ANSWER,
  not_answered: OUTCOME.NO_ANSWER,
  canceled: OUTCOME.CANCELED,
  cancelled: OUTCOME.CANCELED,
  calling: OUTCOME.CANCELED,
  rejected: OUTCOME.REJECTED,
  rejecting: OUTCOME.REJECTED,
  'not-callable': OUTCOME.NOT_CALLABLE,
  not_callable: OUTCOME.NOT_CALLABLE,
  failed: OUTCOME.FAILED,
  error: OUTCOME.FAILED
};

// Outcomes that explain why a call never happened. When the connected leg (the
// customer's phone) reports one of these it wins over CallStatus, because the
// parent leg still reads "completed" for a busy or unanswered number.
const LEG_FAILURES = new Set([
  OUTCOME.BUSY, OUTCOME.NO_ANSWER, OUTCOME.CANCELED,
  OUTCOME.REJECTED, OUTCOME.NOT_CALLABLE, OUTCOME.FAILED
]);

const firstValue = (params, keys) => {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  }
  return null;
};

const mapped = (raw) => (raw ? STATUS_MAP[raw] ?? OUTCOME.UNKNOWN : null);

export function outcomeFromParams(params = {}) {
  const leg = mapped(firstValue(params, ['ConnectStatus', 'connectStatus', 'DialCallStatus', 'dialCallStatus']));
  if (leg && LEG_FAILURES.has(leg)) return leg;
  const call = mapped(firstValue(params, ['CallStatus', 'callStatus', 'Result', 'result', 'StreamStatus', 'streamStatus']));
  return call ?? leg ?? OUTCOME.UNKNOWN;
}

// Human-readable reason for the failures a solo operator actually hits, so the
// UI can say what to fix instead of showing a bare status.
// Only codes confirmed against Twilio's error dictionary are named here;
// everything else is passed through with its ErrorMoreInfo link untouched.
const ERROR_HINTS = {
  21211: "Twilio rejected the 'To' number as invalid — use E.164 with a real country code.",
  21219: "Trial account: the 'To' number must be verified in the Twilio console before it can be called.",
  11200: "Twilio could not retrieve TwiML from your webhook URL (an HTTP error came back) — check PUBLIC_BASE_URL is reachable from the internet."
};

export function twilioErrorHint(code) {
  const n = Number(code);
  return Number.isFinite(n) ? ERROR_HINTS[n] || null : null;
}

// Sales status for an unanswered attempt: the existing status vocabulary has no
// "unreachable" value, and adding one would rewrite badges/analytics across the
// app, so failed attempts archive as No Response and the real reason lives in
// `outcome`.
export function statusForOutcome(outcome) {
  return outcome === OUTCOME.COMPLETED ? null : 'No Response';
}

export function outcomeLabel(outcome) {
  switch (outcome) {
    case OUTCOME.COMPLETED: return 'Completed';
    case OUTCOME.BUSY: return 'Busy';
    case OUTCOME.NO_ANSWER: return 'No answer';
    case OUTCOME.CANCELED: return 'Canceled';
    case OUTCOME.REJECTED: return 'Rejected';
    case OUTCOME.NOT_CALLABLE: return 'Not callable';
    case OUTCOME.FAILED: return 'Failed';
    case OUTCOME.ACTIVE: return 'In progress';
    case OUTCOME.RINGING: return 'Ringing';
    case OUTCOME.QUEUED: return 'Queued';
    default: return 'Unknown';
  }
}
