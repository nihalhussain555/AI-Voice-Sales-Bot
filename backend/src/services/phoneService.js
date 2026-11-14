// App-facing phone service: dial a customer, hang up, and report what is
// happening. Twilio-facing webhook handling lives in telephony.js; both share one
// callLifecycle instance so there is a single truth about each call attempt.

import { twilioConfig, twilioReadiness, groqConfig } from '../config/env.js';
import { resolveProduct } from './salesTurn.js';
import { normalizeE164, OUTCOME, outcomeLabel } from '../utils/phone.js';
import * as twilioSdk from './twilioClient.js';

function httpError(status, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== null));
  if (Object.keys(clean).length) err.details = clean;
  return err;
}

export function createPhoneService({
  lifecycle,
  config = twilioConfig,
  readiness = twilioReadiness,
  hasAiKey = () => Boolean(groqConfig.apiKey()),
  twilioClient = twilioSdk
} = {}) {
  if (!lifecycle) throw new Error('createPhoneService requires a callLifecycle instance');

  function wsUrlFor(base) {
    return base.startsWith('https')
      ? `${base.replace(/^https/, 'wss')}/ws/media`
      : `${base.replace(/^http/, 'ws')}/ws/media`;
  }

  // Real outbound call: Twilio dials the customer, our websocket carries the
  // audio, and the sales agent answers live. `userId` is the signed-in account the
  // call belongs to; every row it produces lands in that workspace.
  async function dial({ userId, to, productKey = 'devpulse', customerName = null } = {}) {
    if (!userId) throw httpError(401, 'A signed-in account is required to place a call');

    const ready = readiness();
    if (!ready.dialReady) {
      throw httpError(503, `Live calling is not configured — set ${ready.dialMissing.join(', ')} in backend/.env`, {
        missing: ready.dialMissing
      });
    }

    const number = normalizeE164(to);
    if (!number) {
      throw httpError(400, 'Phone number must be E.164 — country code then number, e.g. +14155551234', {
        invalid: String(to ?? '')
      });
    }

    if (!lifecycle.hasCapacity()) {
      const { maxConcurrentCalls } = config();
      throw httpError(429, `All ${maxConcurrentCalls} concurrent call slots are busy — try again when one ends`, {
        active: lifecycle.activeCount()
      });
    }

    const cfg = config();
    const eventsUrl = `${cfg.publicBaseUrl}/api/twilio/events`;
    // The real CallSid does not exist until Twilio creates the call, so the
    // attempt is registered under a token that rides along inside the TwiML
    // <Parameter> and is adopted once the REST response returns.
    const dialToken = `dial-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const product = resolveProduct(productKey);

    const twiml = twilioClient.buildConnectTwiML({
      wsUrl: wsUrlFor(cfg.publicBaseUrl),
      eventsUrl,
      extraParams: { dialToken, productKey, direction: 'outbound-dial' }
    });

    let created;
    try {
      created = await twilioClient.placeCall({ to: number, from: cfg.phoneNumber, twiml, eventsUrl });
    } catch (err) {
      if (err.code) {
        // Twilio refused before the call ever existed: record why, then surface it.
        const attempt = lifecycle.startAttempt({
          callSid: dialToken,
          userId,
          direction: 'outbound',
          from: cfg.phoneNumber,
          to: number,
          customerName,
          product: product?.name || null,
          productKey
        });
        attempt.errorCode = err.code;
        attempt.errorMessage = err.message;
        await lifecycle.finalize(attempt.callSid, OUTCOME.FAILED, 'dial-rejected');
        throw httpError(502, `Twilio rejected the call: ${err.message}`, {
          twilioCode: err.code,
          hint: err.code === 21219 ? 'Trial account: verify this number in the Twilio console first.' : undefined
        });
      }
      throw httpError(502, `Twilio request failed: ${err.message}`);
    }

    const attempt = lifecycle.startAttempt({
      callSid: dialToken,
      userId,
      direction: 'outbound',
      from: cfg.phoneNumber,
      to: number,
      customerName,
      product: product?.name || null,
      productKey
    });
    // Twilio may already have started streaming by the time the REST call
    // returns, so re-key defensively and let the websocket re-bind.
    lifecycle.rekey(dialToken, created.sid);
    if (created.status) {
      lifecycle.applyParams({ CallSid: created.sid, CallStatus: created.status }, { source: 'dial-response' });
    }

    return {
      ...lifecycle.snapshot(lifecycle.get(created.sid)),
      dialToken,
      configuredFrom: cfg.phoneNumber
    };
  }

  // Call attempts are addressed by Twilio's CallSid, which is a secret but not a
  // capability: guessing or being shown one must not let a second account steer
  // somebody else's call. Anything not owned by the caller answers 404, the same
  // as an id that does not exist.
  function ownedAttempt(userId, callSid) {
    const attempt = lifecycle.get(callSid);
    if (!attempt || (attempt.userId || null) !== (userId || null)) {
      throw httpError(404, `No such call attempt: ${callSid}`);
    }
    return attempt;
  }

  async function hangup(userId, callSid) {
    const attempt = ownedAttempt(userId, callSid);
    if (attempt.terminal) {
      return { ...lifecycle.snapshot(attempt), alreadyEnded: true };
    }

    const cfg = config();
    if (cfg.accountSid && cfg.authToken) {
      try {
        await twilioClient.endCall(callSid, {
          ringing: attempt.state === OUTCOME.QUEUED || attempt.state === OUTCOME.RINGING
        });
      } catch (err) {
        // The call may already be gone on Twilio's side; still close it locally.
        attempt.errorMessage = attempt.errorMessage || `Twilio hangup: ${err.message}`;
      }
    }
    attempt.session?.closeSocket?.('user hangup');
    await lifecycle.finalize(callSid, OUTCOME.CANCELED, 'app-hangup');
    return lifecycle.snapshot(lifecycle.get(callSid));
  }

  // Pull the authoritative status from Twilio. Callbacks normally deliver this,
  // but a lost callback (server restart, ngrok URL change) is recoverable.
  async function refresh(userId, callSid) {
    const attempt = ownedAttempt(userId, callSid);
    if (attempt.terminal) return lifecycle.snapshot(attempt);
    try {
      const live = await twilioClient.fetchCall(callSid);
      await lifecycle.applyParams(
        {
          CallSid: live.sid,
          CallStatus: live.status,
          CallDuration: live.duration,
          ErrorCode: live.errorCode ?? '',
          ErrorMessage: live.errorMessage || ''
        },
        { source: 'poll' }
      );
    } catch (err) {
      if (err.status === 501 || err.code === 'TWILIO_UNCONFIGURED') throw err;
      throw httpError(502, `Could not read call status from Twilio: ${err.message}`);
    }
    return lifecycle.snapshot(lifecycle.get(callSid));
  }

  function attempts({ userId = null, activeOnly = false } = {}) {
    return lifecycle.list({ userId, activeOnly }).map((a) => lifecycle.snapshot(a));
  }

  function attempt(userId, callSid) {
    const found = ownedAttempt(userId, callSid);
    return lifecycle.snapshot(found);
  }

  function status(userId = null) {
    const ready = readiness();
    const cfg = config();
    return {
      mode: ready.mode,
      dialReady: ready.dialReady,
      inboundReady: ready.inboundReady,
      missing: ready.dialMissing,
      phoneNumber: ready.phoneNumber,
      webhookUrl: ready.webhookUrl,
      eventsUrl: ready.eventsUrl,
      aiReady: hasAiKey(),
      signatureValidation: ready.validate,
      maxConcurrentCalls: cfg.maxConcurrentCalls,
      maxCallMinutes: cfg.maxCallMinutes,
      activeCalls: lifecycle.activeCount(),
      calls: attempts({ userId }),
      outcomes: Object.values(OUTCOME).map((value) => ({ value, label: outcomeLabel(value) }))
    };
  }

  return { dial, hangup, refresh, attempts, attempt, status, wsUrlFor };
}
