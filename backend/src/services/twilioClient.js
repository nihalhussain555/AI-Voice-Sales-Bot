// The only module that talks to Twilio. Everything else (telephony, lifecycle,
// controllers) goes through here, so tests can substitute the SDK without
// touching call logic.

import Twilio from 'twilio';
import { twilioConfig } from '../config/env.js';

let clientFactory = (sid, token) => Twilio(sid, token);

// Test seam: returns the previous factory so a test can restore it.
export function setTwilioClientFactory(fn) {
  const prev = clientFactory;
  clientFactory = typeof fn === 'function' ? fn : (sid, token) => Twilio(sid, token);
  return prev;
}

export function getClient() {
  const { accountSid, authToken } = twilioConfig();
  if (!accountSid || !authToken) return null;
  return clientFactory(accountSid, authToken);
}

export function requireClient() {
  const client = getClient();
  if (!client) {
    const err = new Error('Telephony not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    err.code = 'TWILIO_UNCONFIGURED';
    err.status = 501;
    throw err;
  }
  return client;
}

// Twilio signs every webhook it sends. Validation needs the exact public URL it
// called us on, so it can only run when PUBLIC_BASE_URL is set.
export function validateSignature({ url, signature }) {
  const { authToken, validate, publicBaseUrl } = twilioConfig();
  if (!validate || !publicBaseUrl) return { checked: false, valid: true };
  if (!signature) return { checked: true, valid: false };
  try {
    return { checked: true, valid: Twilio.validateRequest(authToken, signature, url) };
  } catch (err) {
    return { checked: true, valid: false, error: err.message };
  }
}

// <Connect action=…><Stream url=…><Parameter name="callSid" …/></Stream></Connect>
//
// Two things this fixes versus the previous TwiML:
// - the action URL makes Twilio report the connected leg's end status
//   (busy / no-answer / canceled / failed) instead of leaving us guessing;
// - <Parameter> rides through to the websocket "start" event, so the socket can
//   be bound to its real CallSid instead of the FIFO arrival-order guess.
export function buildConnectTwiML({ wsUrl, eventsUrl, callSid = null, extraParams = {} }) {
  const vr = new Twilio.twiml.VoiceResponse();
  const connectAttrs = {};
  if (eventsUrl) {
    connectAttrs.action = eventsUrl;
    connectAttrs.method = 'POST';
  }
  const connect = vr.connect(connectAttrs);
  const stream = connect.stream({ url: wsUrl });
  const params = { ...extraParams };
  if (callSid) params.callSid = callSid;
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    stream.parameter({ name, value: String(value) });
  }
  return vr.toString();
}

// Outbound dial. Returns the created call's { sid, status }; the call then lives
// or dies via status callbacks + the Connect action.
export async function placeCall({ to, from, twiml, eventsUrl }) {
  const client = requireClient();
  const cfg = twilioConfig();
  const params = { to, from, twiml };
  if (eventsUrl && cfg.statusCallback) {
    params.statusCallback = eventsUrl;
    params.statusCallbackMethod = 'POST';
    params.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no-answer', 'canceled'];
  }
  try {
    const call = await client.calls.create(params);
    return { sid: call.sid, status: call.status, direction: call.direction, from: call.from, to: call.to };
  } catch (err) {
    throw asTwilioError(err);
  }
}

export async function fetchCall(sid) {
  const client = requireClient();
  try {
    const call = await client.calls(sid).fetch();
    return { sid: call.sid, status: call.status, duration: Number(call.duration || 0), errorCode: call.errorCode ?? null, errorMessage: call.errorMessage || null };
  } catch (err) {
    throw asTwilioError(err);
  }
}

// Hang up now. 'cancel' stops a call that is still queued/ringing; a call that is
// already talking is ended with 'completed'.
export async function endCall(sid, { ringing = false } = {}) {
  const client = requireClient();
  try {
    const call = await client.calls(sid).update({ status: ringing ? 'cancel' : 'completed' });
    return { sid: call.sid, status: call.status };
  } catch (err) {
    throw asTwilioError(err);
  }
}

function asTwilioError(err) {
  const code = Number(err?.code) || null;
  const out = new Error(err?.message || 'Twilio request failed');
  out.name = 'TwilioError';
  if (code) out.code = code;
  if (err?.moreInfo) out.moreInfo = err.moreInfo;
  if (typeof err?.status === 'number') out.httpStatus = err.status;
  return out;
}
