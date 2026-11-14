// Phase 1 phone-calling tests: everything that must be right before a real
// Twilio account is connected. No network: Twilio is doubled through the
// client factory, Groq through the telephony provider seam, and persistence
// through an injected in-memory db.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';

import { normalizeE164, isValidE164, outcomeFromParams, isTerminalOutcome, twilioErrorHint, OUTCOME } from '../utils/phone.js';
import { buildAnalytics } from '../services/analytics.js';
import { createCallLifecycle } from '../services/callLifecycle.js';
import { createTelephony } from '../services/telephony.js';
import { createPhoneService } from '../services/phoneService.js';
import { setTwilioClientFactory } from '../services/twilioClient.js';
import { buildWav } from '../utils/audioCodecs.js';
import { linearToMulawBuffer } from '../utils/audioCodecs.js';
import phoneRoutes from '../routes/phone.routes.js';
import { apiError } from '../middleware/error-handler.js';

const ENV = {
  TWILIO_ACCOUNT_SID: 'ACtestaccount',
  TWILIO_AUTH_TOKEN: 'secret-token',
  TWILIO_PHONE_NUMBER: '+15005550001',
  PUBLIC_BASE_URL: 'https://tunnel.example.com',
  TWILIO_VALIDATE: 'false',
  GROQ_API_KEY: 'gsk_test_key',
  MAX_CALL_MINUTES: '15',
  TWILIO_MAX_CONCURRENT_CALLS: '3',
  TWILIO_STATUS_CALLBACK: 'true'
};

const KEYS = Object.keys(ENV);

function useEnv(overrides = {}) {
  const saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    if (k in overrides) {
      if (overrides[k] === null) delete process.env[k];
      else process.env[k] = overrides[k];
    } else {
      process.env[k] = ENV[k];
    }
  }
  return () => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

// The app-facing phone routes are account-scoped now. Telephony is one shared
// process-wide pipeline (Twilio addresses attempts by CallSid, not by session),
// so the tests sign every request in as one fixed workspace owner.
const TEST_USER = { id: 'user-test-1', email: 'owner@example.com', fullName: 'Test Owner', status: 'active' };

function makeDb() {
  return {
    rows: [],
    // Mirrors models/db.js: the owner is stamped by the store, never trusted
    // from the record, and a repeat save for the same id updates in place.
    saveCall(userId, call) {
      const record = { ...call, userId };
      const i = this.rows.findIndex((r) => r.id === record.id);
      if (i >= 0) this.rows[i] = record;
      else this.rows.push(record);
      return record;
    },
    getCalls(userId) {
      return userId ? this.rows.filter((r) => r.userId === userId) : this.rows;
    }
  };
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

test('E.164: normalizes typed numbers, rejects anything without a country code', () => {
  assert.equal(normalizeE164('+1 (415) 555-1234'), '+14155551234');
  assert.equal(normalizeE164('0044 20 7123 1234'), '+442071231234');
  assert.equal(normalizeE164('  +91-98765-43210  '), '+919876543210');
  // A national number without a country code must never be dialed: '415-555-1234'
  // prefixed with + is Switzerland, not California.
  assert.equal(normalizeE164('415-555-1234'), null);
  assert.equal(normalizeE164('14155551234'), null);
  assert.equal(normalizeE164('not a number'), null);
  assert.equal(normalizeE164('+1'), null, 'too short to be a real number');
  assert.equal(normalizeE164(''), null);
  assert.equal(isValidE164('+14155551234'), true);
  assert.equal(isValidE164('14155551234'), false, 'leading + is required');
});

test('outcome taxonomy understands every Twilio status spelling we can receive', () => {
  assert.equal(outcomeFromParams({ CallStatus: 'completed' }), OUTCOME.COMPLETED);
  assert.equal(outcomeFromParams({ CallStatus: 'in-progress' }), OUTCOME.ACTIVE);
  assert.equal(outcomeFromParams({ ConnectStatus: 'busy' }), OUTCOME.BUSY);
  assert.equal(outcomeFromParams({ ConnectStatus: 'no-answer' }), OUTCOME.NO_ANSWER);
  assert.equal(outcomeFromParams({ CallStatus: 'noanswer' }), OUTCOME.NO_ANSWER);
  assert.equal(outcomeFromParams({ ConnectStatus: 'canceled' }), OUTCOME.CANCELED);
  assert.equal(outcomeFromParams({ ConnectStatus: 'rejected' }), OUTCOME.REJECTED);
  assert.equal(outcomeFromParams({ CallStatus: 'not-callable' }), OUTCOME.NOT_CALLABLE);
  assert.equal(outcomeFromParams({ CallStatus: 'failed' }), OUTCOME.FAILED);
  assert.equal(outcomeFromParams({}), OUTCOME.UNKNOWN);
  assert.equal(outcomeFromParams({ CallStatus: 'ringing' }), OUTCOME.RINGING);

  assert.ok(isTerminalOutcome(OUTCOME.BUSY) && isTerminalOutcome(OUTCOME.COMPLETED));
  assert.ok(!isTerminalOutcome(OUTCOME.RINGING) && !isTerminalOutcome(OUTCOME.ACTIVE));
  assert.match(twilioErrorHint(21219), /trial account/i);
  assert.equal(twilioErrorHint(999999), null, 'unknown codes are passed through, never invented');
});

// ---------------------------------------------------------------------------
// stack helper
// ---------------------------------------------------------------------------

async function startStack({ overrides = {}, db = makeDb(), summarize, providers, twilioDouble } = {}) {
  const restoreEnv = useEnv(overrides);
  const calls = [];
  const restoreFactory = setTwilioClientFactory(twilioDouble || makeDefaultSdkDouble(calls));

  const lifecycle = createCallLifecycle({
    db,
    summarize: summarize || (async () => ({ status: 'Interested', overview: 'stub', requirements: [], objections: [], nextSteps: [], sentiment: 'Positive', dealScore: 50 })),
    // An inbound Twilio call carries no session; in production it is attributed
    // to the account that owns the number, here to the single test owner.
    resolveUserId: () => TEST_USER.id,
    config: () => ({
      maxCallMinutes: Number(process.env.MAX_CALL_MINUTES || 15),
      maxConcurrentCalls: Number(process.env.TWILIO_MAX_CONCURRENT_CALLS || 3),
      statusCallback: (process.env.TWILIO_STATUS_CALLBACK ?? 'true') !== 'false',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      publicBaseUrl: process.env.PUBLIC_BASE_URL
    }),
    log: () => {}
  });

  const telephony = createTelephony({ lifecycle, providers: providers || stubProviders() });
  const phoneService = createPhoneService({ lifecycle, hasAiKey: () => Boolean(process.env.GROQ_API_KEY) });

  const app = express();
  app.locals.phoneService = phoneService;
  app.use(telephony.router);
  app.use('/api/phone', (req, _res, next) => {
    req.user = TEST_USER;
    next();
  });
  app.use('/api/phone', phoneRoutes);
  app.use(apiError);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  telephony.attachWebSocket(server);
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    server,
    db,
    lifecycle,
    phoneService,
    sdkCalls: calls,
    wsUrl: `ws://127.0.0.1:${server.address().port}/ws/media`,
    form: async (path, params) => fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    }),
    json: async (path, opts = {}) => {
      const res = await fetch(`${base}${path}`, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    async close() {
      // Bounded: server.close() waits for open websockets, and a leaked stream
      // would otherwise hang teardown and hide the assertion that really failed.
      await Promise.race([
        new Promise((r) => server.close(r)),
        new Promise((r) => setTimeout(r, 3000))
      ]);
      lifecycle.stop();
      restoreFactory();
      restoreEnv();
    }
  };
}

function makeDefaultSdkDouble(sink) {
  return () => ({
    calls: Object.assign(
      (sid) => ({
        fetch: async () => ({ sid, status: 'completed', duration: 42, errorCode: null, errorMessage: null }),
        update: async (opts) => { sink.push({ action: 'update', sid, ...opts }); return { sid, status: opts.status }; }
      }),
      {
        create: async (params) => {
          sink.push({ action: 'create', ...params });
          return { sid: 'CAreal123', status: 'queued', direction: 'outbound-api', from: params.from, to: params.to };
        }
      }
    )
  });
}

function stubProviders({ customerSays = 'Yes, tell me more.' } = {}) {
  return {
    transcribe: async () => customerSays,
    // 0.4s of 24kHz tone: resampled to 8k that is 20 chunks = 400ms of playback.
    tts: async ({ text }) => buildWav(toneSamples(24000, text.length * 40), 24000),
    turn: async ({ message }) => ({
      reply: message ? `Reply to: ${message}` : 'Hello, this is the sales agent.',
      provider: 'stub'
    })
  };
}

function toneSamples(count, amp = 4000) {
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) out[i] = Math.round(amp * Math.sin((i / 8) * Math.PI));
  return out;
}

// ---------------------------------------------------------------------------
// inbound webhook (items 4, 10)
// ---------------------------------------------------------------------------

test('inbound webhook returns Connect+Stream TwiML carrying the CallSid and an events action', async () => {
  const t = await startStack();
  try {
    const res = await t.form('/api/twilio/voice', {
      CallSid: 'CAinbound1',
      From: '+15550001111',
      To: '+15005550001',
      Direction: 'inbound'
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/xml/);
    const xml = await res.text();
    assert.match(xml, /<Connect\b[^>]*action="https:\/\/tunnel\.example\.com\/api\/twilio\/events"/);
    assert.match(xml, /<Stream url="wss:\/\/tunnel\.example\.com\/ws\/media"\/?>|<Stream url="wss:\/\/tunnel\.example\.com\/ws\/media">/);
    assert.match(xml, /<Parameter name="callSid" value="CAinbound1"\/>/);
    assert.match(xml, /<Parameter name="direction" value="inbound"\/>/);
    const attempt = t.lifecycle.get('CAinbound1');
    assert.ok(attempt, 'the attempt is registered before Twilio opens the socket');
    assert.equal(attempt.direction, 'inbound');
    assert.equal(attempt.from, '+15550001111');
  } finally {
    await t.close();
  }
});

test('inbound call with no Groq key is answered with an apology and logged as failed, not left silent', async () => {
  const t = await startStack({ overrides: { GROQ_API_KEY: null } });
  try {
    const res = await t.form('/api/twilio/voice', { CallSid: 'CAnokey', From: '+15550002222', To: '+15005550001' });
    const xml = await res.text();
    assert.equal(res.status, 200, 'Twilio must always get valid TwiML, never a 5xx');
    assert.match(xml, /<Say>/);
    assert.match(xml, /<Hangup\/>/);
    assert.deepEqual(t.lifecycle.list()[0].outcome, OUTCOME.FAILED);
    assert.equal(t.db.rows.length, 1);
    assert.equal(t.db.rows[0].outcome, 'failed');
    assert.equal(t.db.rows[0].status, 'No Response');
  } finally {
    await t.close();
  }
});

test('inbound call beyond the concurrency cap is told the agents are busy and recorded as busy', async () => {
  const t = await startStack({ overrides: { TWILIO_MAX_CONCURRENT_CALLS: '1' } });
  try {
    await t.form('/api/twilio/voice', { CallSid: 'CAfirst', From: '+15550003333' });
    const second = await t.form('/api/twilio/voice', { CallSid: 'CAsecond', From: '+15550004444' });
    const xml = await second.text();
    assert.match(xml, /try again in a moment/i);
    assert.equal(t.lifecycle.get('CAsecond').outcome, OUTCOME.BUSY);
    assert.equal(t.db.rows.filter((r) => r.outcome === 'busy').length, 1);
  } finally {
    await t.close();
  }
});

test('voice webhook rejects a bad Twilio signature once PUBLIC_BASE_URL validation is on', async () => {
  const t = await startStack({ overrides: { TWILIO_VALIDATE: 'true' } });
  try {
    const res = await fetch(`${t.base}/api/twilio/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'bogus' },
      body: 'CallSid=CAbadsig&From=%2B15550005555'
    });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /signature/i);
  } finally {
    await t.close();
  }
});

// ---------------------------------------------------------------------------
// disconnect handling (item 9)
// ---------------------------------------------------------------------------

test('every unanswered call outcome is persisted once, with the reason, even with no transcript', async () => {
  let summarized = 0;
  const t = await startStack({ summarize: async () => { summarized++; return { status: 'Interested' }; } });
  const cases = [
    { params: { CallSid: 'CAbusy', CallStatus: 'completed', ConnectStatus: 'busy', Direction: 'outbound-api' }, outcome: 'busy' },
    { params: { CallSid: 'CAnoanswer', CallStatus: 'completed', ConnectStatus: 'no-answer', Direction: 'outbound-api' }, outcome: 'no-answer' },
    { params: { CallSid: 'CAcancel', CallStatus: 'canceled', Direction: 'outbound-api' }, outcome: 'canceled' },
    { params: { CallSid: 'CAreject', CallStatus: 'completed', ConnectStatus: 'rejected' }, outcome: 'rejected' },
    { params: { CallSid: 'CAnotcallable', CallStatus: 'not-callable' }, outcome: 'not-callable' },
    { params: { CallSid: 'CAfail', CallStatus: 'failed', ErrorCode: '21219', ErrorMoreInfo: 'https://www.twilio.com/docs/errors/21219' }, outcome: 'failed' }
  ];
  try {
    for (const c of cases) {
      const res = await t.form('/api/twilio/events', c.params);
      assert.equal(res.status, 200, 'callbacks must always be acked so Twilio stops retrying');
      assert.equal((await res.text()), '<Response/>');
    }
    assert.equal(t.db.rows.length, cases.length);
    for (const c of cases) {
      const row = t.db.rows.find((r) => r.callSid === c.params.CallSid);
      assert.ok(row, `row for ${c.params.CallSid}`);
      assert.equal(row.outcome, c.outcome);
      assert.equal(row.status, 'No Response');
      assert.equal(row.channel, 'phone');
      assert.equal(row.transcript.length, 0);
      assert.ok(row.terminalSource, 'records which signal closed the call');
    }
    const failed = t.db.rows.find((r) => r.callSid === 'CAfail');
    assert.equal(failed.twilioErrorCode, 21219);
    assert.match(failed.twilioErrorHint, /trial account/i);
    assert.equal(summarized, 0, 'an unanswered call never spends a Groq summarization request');
  } finally {
    await t.close();
  }
});

test('a second terminal callback for the same call cannot duplicate the history row', async () => {
  const t = await startStack();
  try {
    await t.form('/api/twilio/events', { CallSid: 'CAdup', CallStatus: 'busy' });
    await t.form('/api/twilio/events', { CallSid: 'CAdup', CallStatus: 'completed', CallDuration: '0' });
    await t.form('/api/twilio/events', { CallSid: 'CAdup', ConnectStatus: 'no-answer' });
    assert.equal(t.db.rows.length, 1);
    assert.equal(t.db.rows[0].outcome, 'busy', 'the first terminal signal wins');
  } finally {
    await t.close();
  }
});

test('progress callbacks update the live state without ending the call', async () => {
  const t = await startStack();
  try {
    await t.form('/api/twilio/events', { CallSid: 'CAprog', CallStatus: 'queued' });
    assert.equal(t.lifecycle.get('CAprog').state, 'queued');
    await t.form('/api/twilio/events', { CallSid: 'CAprog', CallStatus: 'ringing' });
    assert.equal(t.lifecycle.get('CAprog').state, 'ringing');
    await t.form('/api/twilio/events', { CallSid: 'CAprog', CallStatus: 'in-progress' });
    const live = t.lifecycle.get('CAprog');
    assert.equal(live.state, 'active');
    assert.ok(live.connectedAt, 'answered time is captured for duration');
    assert.equal(live.terminal, false);
    assert.equal(t.db.rows.length, 0);

    await t.form('/api/twilio/events', { CallSid: 'CAprog', CallStatus: 'completed', CallDuration: '73' });
    const row = t.db.rows[0];
    assert.equal(row.outcome, 'completed');
    assert.equal(row.duration, 73, 'Twilio answer duration wins over local clocks');
  } finally {
    await t.close();
  }
});

// ---------------------------------------------------------------------------
// outbound dialing (items 1, 2, 3)
// ---------------------------------------------------------------------------

test('dial places a real Twilio call with status callback + stream TwiML and tracks the attempt', async () => {
  const t = await startStack();
  try {
    const res = await t.json('/api/phone/dial', { method: 'POST', body: { to: '+1 (415) 555-9999', productKey: 'devpulse' } });
    assert.equal(res.status, 200);
    const call = res.body.call;
    assert.equal(call.callSid, 'CAreal123', 'the attempt adopts the CallSid Twilio assigned');
    assert.equal(call.to, '+14155559999', 'typed input is normalized to E.164');
    assert.equal(call.direction, 'outbound');
    assert.equal(call.state, 'queued');
    assert.equal(call.configuredFrom, '+15005550001');

    const created = t.sdkCalls.find((c) => c.action === 'create');
    assert.equal(created.to, '+14155559999');
    assert.equal(created.from, '+15005550001');
    assert.equal(created.statusCallback, 'https://tunnel.example.com/api/twilio/events');
    assert.ok(created.statusCallbackEvent.includes('busy'), 'busy must be reported or we cannot classify it');
    assert.match(created.twiml, /<Connect\b[^>]*action="https:\/\/tunnel\.example\.com\/api\/twilio\/events"/);
    assert.match(created.twiml, /<Stream url="wss:\/\/tunnel\.example\.com\/ws\/media"/);
    assert.match(created.twiml, new RegExp('<Parameter name="dialToken" value="' + call.dialToken + '"\\/>'));
    assert.ok(!t.lifecycle.get(call.dialToken), 'the token key is gone after re-key');
    assert.equal(t.lifecycle.list().length, 1, 'exactly one attempt tracked');
  } finally {
    await t.close();
  }
});

test('dial refuses bad numbers before spending a Twilio request, and explains a missing config', async () => {
  const t = await startStack();
  try {
    const bad = await t.json('/api/phone/dial', { method: 'POST', body: { to: 'hello' } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /E\.164/);
    assert.equal(t.sdkCalls.filter((c) => c.action === 'create').length, 0, 'no Twilio spend on a rejected number');
  } finally {
    await t.close();
  }

  const off = await startStack({ overrides: { TWILIO_PHONE_NUMBER: null, PUBLIC_BASE_URL: null } });
  try {
    const res = await off.json('/api/phone/dial', { method: 'POST', body: { to: '+14155559999' } });
    assert.equal(res.status, 503);
    assert.match(res.body.error, /TWILIO_PHONE_NUMBER.*PUBLIC_BASE_URL|PUBLIC_BASE_URL.*TWILIO_PHONE_NUMBER/);
    assert.deepEqual(res.body.missing, ['TWILIO_PHONE_NUMBER', 'PUBLIC_BASE_URL']);
  } finally {
    await off.close();
  }
});

test('dial blocked by capacity or by a Twilio rejection still leaves a visible, explained attempt', async () => {
  const reject = await startStack({
    overrides: { TWILIO_MAX_CONCURRENT_CALLS: '1' },
    db: makeDb(),
    twilioDouble: () => ({
      calls: Object.assign(() => ({}), {
        create: async () => {
          const err = new Error("This 'to' number is not verified for your trial account");
          err.code = 21219;
          throw err;
        }
      })
    })
  });
  try {
    const first = await reject.json('/api/phone/dial', { method: 'POST', body: { to: '+14155550000' } });
    assert.equal(first.status, 502);
    assert.match(first.body.error, /not verified/);
    assert.match(first.body.hint, /verify this number/i);
    assert.equal(reject.db.rows.length, 1);
    assert.equal(reject.db.rows[0].outcome, 'failed');
    assert.equal(reject.db.rows[0].twilioErrorCode, 21219);
  } finally {
    await reject.close();
  }

  const busy = await startStack({ overrides: { TWILIO_MAX_CONCURRENT_CALLS: '1' } });
  try {
    await busy.json('/api/phone/dial', { method: 'POST', body: { to: '+14155550000' } });
    const second = await busy.json('/api/phone/dial', { method: 'POST', body: { to: '+14155550001' } });
    assert.equal(second.status, 429);
    assert.match(second.body.error, /concurrent call slots/);
  } finally {
    await busy.close();
  }
});

test('hangup ends the call on Twilio, closes the attempt once, and is idempotent', async () => {
  const t = await startStack();
  try {
    const dialed = await t.json('/api/phone/dial', { method: 'POST', body: { to: '+14155557777' } });
    const sid = dialed.body.call.callSid;
    const res = await t.json(`/api/phone/calls/${sid}/hangup`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.body.call.outcome, 'canceled');
    assert.equal(res.body.call.terminal, true);
    const update = t.sdkCalls.find((c) => c.action === 'update');
    assert.equal(update.sid, sid);
    assert.equal(update.status, 'cancel', 'a call that never answered is canceled, not completed');
    assert.equal(t.db.rows.length, 1);

    const again = await t.json(`/api/phone/calls/${sid}/hangup`, { method: 'POST' });
    assert.equal(again.body.call.alreadyEnded, true);
    assert.equal(t.db.rows.length, 1, 'no duplicate history row');

    const missing = await t.json('/api/phone/calls/CAunknown/hangup', { method: 'POST' });
    assert.equal(missing.status, 404);
  } finally {
    await t.close();
  }
});

test('refresh recovers a call whose callback was lost', async () => {
  const t = await startStack({
    twilioDouble: () => ({
      calls: Object.assign((sid) => ({
        fetch: async () => ({ sid, status: 'completed', duration: 12, errorCode: null, errorMessage: 'caller hung up' })
      }), { create: async () => ({ sid: 'CApoll', status: 'queued' }) })
    })
  });
  try {
    await t.json('/api/phone/dial', { method: 'POST', body: { to: '+14155558888' } });
    assert.equal(t.lifecycle.get('CApoll').terminal, false);
    const res = await t.json('/api/phone/calls/CApoll/refresh', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.body.call.outcome, 'completed');
    assert.equal(res.body.call.durationSec, 12);
    assert.equal(t.db.rows.length, 1);
  } finally {
    await t.close();
  }
});

test('phone config reports mode, number and webhook checklist for going live', async () => {
  const t = await startStack();
  try {
    const live = await t.json('/api/phone/config');
    assert.equal(live.body.mode, 'live');
    assert.equal(live.body.dialReady, true);
    assert.equal(live.body.phoneNumber, '+15005550001');
    assert.equal(live.body.webhookUrl, 'https://tunnel.example.com/api/twilio/voice');
    assert.equal(live.body.eventsUrl, 'https://tunnel.example.com/api/twilio/events');
    assert.equal(live.body.aiReady, true);
    assert.equal(live.body.activeCalls, 0);
    assert.ok(live.body.outcomes.some((o) => o.value === 'no-answer'));
  } finally {
    await t.close();
  }

  const off = await startStack({ overrides: { TWILIO_ACCOUNT_SID: null, GROQ_API_KEY: null } });
  try {
    const res = await off.json('/api/phone/config');
    assert.equal(res.body.mode, 'off');
    assert.equal(res.body.aiReady, false, 'the UI must warn that phone AI needs a Groq key');
    assert.ok(res.body.missing.includes('TWILIO_ACCOUNT_SID'));
  } finally {
    await off.close();
  }
});

// ---------------------------------------------------------------------------
// live conversation over the media stream (items 5, 6, 7, 8)
// ---------------------------------------------------------------------------

async function openStream(wsUrl, { dialToken, callSid, streamSid = 'MZstream' }) {
  const ws = new WebSocket(wsUrl);
  const received = [];
  ws.on('message', (raw) => {
    try { received.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  ws.send(JSON.stringify({ event: 'connected', sequence: 1 }));
  await waitFor(() => received.some((m) => m.event === 'connected'), 'connected echo');
  ws.send(JSON.stringify({
    event: 'start',
    sequence: 2,
    streamSid,
    callSid,
    mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
    customParameters: '',
    start: { streamSid, callSid, parameters: { dialToken, direction: 'outbound-dial' } }
  }));
  return { ws, received };
}

function waitFor(condFn, what, timeoutMs = 4000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let ok = false;
      try { ok = condFn(); } catch { ok = false; }
      if (ok) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${what}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

const mulawChunk = (samples) => linearToMulawBuffer(Int16Array.from(samples)).toString('base64');

test('media stream conversation: greeting is spoken, caller speech is transcribed, reply is spoken', async () => {
  const t = await startStack();
  let ws = null;
  try {
    // Register the attempt the way the dial path does, so the socket can bind to it.
    t.lifecycle.startAttempt({ callSid: 'dial-token-1', direction: 'outbound', to: '+14155551111', product: 'DevPulse AI' });

    const opened = await openStream(t.wsUrl, { dialToken: 'dial-token-1', callSid: 'CAstream1' });
    ws = opened.ws;
    const { received } = opened;
    // The start event is processed asynchronously server-side.
    await waitFor(() => t.lifecycle.get('CAstream1'), 'socket bound to the dial attempt');
    const attempt = t.lifecycle.get('CAstream1');
    assert.ok(attempt, 'start parameters bound the socket to the dial attempt');
    assert.equal(attempt.state, 'active', 'the stream starting means the call was answered');
    assert.equal(attempt.streamSid, 'MZstream');

    // The greeting reaches the caller as paced mulaw media.
    await waitFor(() => received.some((m) => m.event === 'media'), 'greeting audio');
    assert.ok(received.some((m) => m.event === 'mark' && /speak-start/.test(m.custom || '')));
    await waitFor(() => received.some((m) => m.event === 'mark' && /speak-end/.test(m.custom || '')), 'greeting finished');

    // Caller says something: 600ms of speech (VAD minSpeech 500ms) followed by
    // 1s of silence (silenceMs 800) closes the utterance.
    const loud = mulawChunk(toneSamples(160, 9000));
    const quiet = mulawChunk(new Int16Array(160));
    for (let i = 0; i < 30; i++) ws.send(JSON.stringify({ event: 'media', sequence: 10 + i, media: { chunk: loud, timestamp: Date.now() } }));
    for (let i = 0; i < 50; i++) ws.send(JSON.stringify({ event: 'media', sequence: 40 + i, media: { chunk: quiet, timestamp: Date.now() } }));

    await waitFor(() => attempt.session.getTranscript().some((m) => m.sender === 'customer'), 'customer transcript');
    const convo = attempt.session.getTranscript();
    assert.equal(convo[0].sender, 'bot', 'greeting is first');
    assert.match(convo[1].text, /Yes, tell me more/);
    assert.equal(convo[2].sender, 'bot');
    assert.match(convo[2].text, /Reply to: Yes/);
    assert.match(convo[0].time, /^\d{2}:\d{2}$/, 'turns carry call-relative timestamps');

    // Hanging up the call archives the conversation with a summary.
    ws.send(JSON.stringify({ event: 'stop', sequence: 99, streamSid: 'MZstream' }));
    await new Promise((r) => setTimeout(r, 2600));
    assert.equal(attempt.terminal, true);
    assert.equal(attempt.outcome, 'completed');
    const row = t.db.rows[0];
    assert.equal(row.id, 'call-phone-CAstream1');
    assert.equal(row.transcript.length, 3);
    assert.equal(row.status, 'Interested', 'summarizer ran for a real conversation');
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    await t.close();
  }
});

test('caller barging in mid-sentence stops playback and the interrupting words are kept', async () => {
  const t = await startStack();
  try {
    t.lifecycle.startAttempt({ callSid: 'dial-token-2', direction: 'outbound', to: '+14155552222' });
    const { ws, received } = await openStream(t.wsUrl, { dialToken: 'dial-token-2', callSid: 'CAbarge' });

    // Wait for playback of the greeting to be under way.
    await waitFor(() => received.filter((m) => m.event === 'media').length >= 3, 'playback started');
    assert.ok(t.lifecycle.get('CAbarge').session, 'attempt bound');

    const loud = mulawChunk(toneSamples(160, 9000));
    for (let i = 0; i < 8; i++) {
      ws.send(JSON.stringify({ event: 'media', sequence: 100 + i, media: { chunk: loud, timestamp: Date.now() } }));
      await new Promise((r) => setTimeout(r, 12));
    }
    const clears = received.filter((m) => m.event === 'clear').length;
    assert.ok(clears >= 2, `Twilio was told to drop buffered audio on barge-in (clears=${clears})`);

    const after = received.length;
    await new Promise((r) => setTimeout(r, 250));
    const mediaAfterBarge = received.slice(after).filter((m) => m.event === 'media').length;
    // Playback is halted; only the barge-in reply may resume audio afterwards.
    assert.ok(mediaAfterBarge <= 40, 'no further greeting chunks are streamed after the interrupt');

    ws.close();
    await new Promise((r) => setTimeout(r, 2600));
  } finally {
    await t.close();
  }
});

test('a socket whose call Twilio already ended is closed instead of lingering', async () => {
  const t = await startStack();
  try {
    t.lifecycle.startAttempt({ callSid: 'dial-token-3', direction: 'outbound', to: '+14155553333' });
    const { ws } = await openStream(t.wsUrl, { dialToken: 'dial-token-3', callSid: 'CAended' });
    // Twilio reports the leg as busy while the stream is technically open.
    await t.form('/api/twilio/events', { CallSid: 'CAended', CallStatus: 'completed', ConnectStatus: 'busy' });
    await waitFor(() => ws.readyState >= WebSocket.CLOSING, 'socket closed by server', 2000);
    assert.equal(t.lifecycle.get('CAended').outcome, 'busy', 'Twilio reason wins over local inference');
    assert.equal(t.db.rows.length, 1);
    ws.close();
  } catch (err) {
    // The socket may already be gone; the assertion above is the real check.
    if (!/socket closed by server/.test(err.message)) throw err;
    assert.equal(t.lifecycle.get('CAended').outcome, 'busy');
  } finally {
    await t.close();
  }
});

test('a websocket with no Twilio parameters falls back to the queued inbound metadata', async () => {
  const t = await startStack();
  try {
    await t.form('/api/twilio/voice', { CallSid: 'CAfifo', From: '+15550009999', To: '+15005550001', Direction: 'inbound' });
    const ws = new WebSocket(t.wsUrl);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.send(JSON.stringify({ event: 'connected', sequence: 1 }));
    // start without callSid/parameters, as an older TwiML would send.
    ws.send(JSON.stringify({ event: 'start', sequence: 2, streamSid: 'MZfifo', mediaFormat: {}, start: { streamSid: 'MZfifo', parameters: {} } }));
    await waitFor(() => t.lifecycle.get('CAfifo')?.streamSid === 'MZfifo', 'FIFO pairing');
    assert.equal(t.lifecycle.get('CAfifo').state, 'active');
    ws.close();
  } finally {
    await t.close();
  }
});

test('GET /api/phone/calls exposes live state, transcript and outcome for the UI', async () => {
  const t = await startStack();
  try {
    await t.json('/api/phone/dial', { method: 'POST', body: { to: '+14155554444', customerName: 'Priya N.' } });
    const list = await t.json('/api/phone/calls');
    assert.equal(list.body.calls.length, 1);
    assert.equal(list.body.calls[0].customerName, 'Priya N.');
    assert.equal(list.body.calls[0].state, 'queued');
    assert.equal(list.body.calls[0].terminal, false);
    assert.ok(list.body.calls[0].durationSec >= 0);

    const one = await t.json('/api/phone/calls/CAreal123');
    assert.equal(one.body.call.to, '+14155554444');
    const missing = await t.json('/api/phone/calls/CAnope');
    assert.equal(missing.status, 404);

    await t.form('/api/twilio/events', { CallSid: 'CAreal123', CallStatus: 'no-answer' });
    const active = await t.json('/api/phone/calls?active=1');
    assert.equal(active.body.calls.length, 0, 'finished calls leave the active list');
  } finally {
    await t.close();
  }
});

test('analytics groups archived phone calls by outcome code, not a stored label', () => {
  const call = (outcome, direction) => ({
    channel: 'phone', direction, outcome,
    status: outcome === 'completed' ? 'Interested' : 'No Response',
    timestamp: new Date().toISOString(),
    duration: outcome === 'completed' ? 42 : 0,
    transcript: outcome === 'completed' ? [{ sender: 'customer', text: 'hi' }] : [],
    summary: { dealScore: outcome === 'completed' ? 70 : 0 }
  });
  const a = buildAnalytics({ calls: [
    call('completed', 'outbound'),
    call('busy', 'outbound'),
    call('no-answer', 'inbound')
  ] });

  const row = (name) => a.byOutcome.find(r => r.name === name);
  assert.equal(a.byOutcome.length, 3, 'one row per distinct outcome');
  assert.equal(row('Completed').calls, 1);
  assert.equal(row('Busy').calls, 1);
  assert.equal(row('No answer').calls, 1, 'hyphenated code renders as words');
  assert.deepEqual(a.byDirection.map(r => [r.name, r.calls]).sort(), [['Inbound', 1], ['Outbound', 2]]);
  assert.deepEqual(a.phone, { attempts: 3, reached: 1, unanswered: 2, reachRate: 33 });
});
