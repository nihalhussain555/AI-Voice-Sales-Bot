// Authentication, session and multi-tenant isolation tests.
//
// These run against the real Express app over a real socket with a throwaway
// DATA_DIR, so cookies, rate-limit counters and the per-user file layout are all
// exercised exactly as they behave in production. No module is stubbed except
// outbound mail, which has no SMTP server here by design.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-auth-'));
const REC_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-auth-rec-'));

process.env.DATA_DIR = DATA_DIR;
process.env.RECORDINGS_DIR = REC_DIR;
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = 'false';
// Deliberately tight so the throttling tests below do not have to send hundreds
// of requests; distinct emails get distinct buckets.
process.env.LOGIN_RATE_MAX = '6';
process.env.SIGNUP_RATE_MAX = '60';
process.env.FORGOT_RATE_MAX = '6';
process.env.AUTH_ECHO_RESET_LINK = 'true';

const { createApp } = await import('../app.js');
const { db } = await import('../models/db.js');
const { SESSIONS_FILE, readJson, writeJson } = await import('../models/store.js');

const app = createApp({});
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

after(() => {
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(REC_DIR, { recursive: true, force: true });
});

// ── helpers ──────────────────────────────────────────────────────────────────

const PASSWORD = 'Str0ngPass!23';

// A cookie jar per "browser": the whole point is to prove the session survives
// the equivalent of a page refresh, which is just another request carrying the
// cookie the server set earlier.
function client() {
  let cookie = null;

  async function request(method, url, { body, json = true, headers = {}, formData = null } = {}) {
    const init = { method, headers: { ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (formData) {
      init.body = formData;
    } else if (body !== undefined) {
      if (json) init.headers['Content-Type'] = 'application/json';
      init.body = json ? JSON.stringify(body) : body;
    }
    const res = await fetch(`${base}${url}`, init);
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const [pair] = entry.split(';');
      const [, value] = pair.split('=');
      if (value === undefined || value === '') cookie = null;
      else cookie = pair;
    }
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed, headers: res.headers, setCookie };
  }

  return {
    get: (url, opts) => request('GET', url, opts),
    post: (url, body, opts) => request('POST', url, { body, ...opts }),
    put: (url, body) => request('PUT', url, { body }),
    patch: (url, body) => request('PATCH', url, { body }),
    del: (url) => request('DELETE', url),
    raw: request,
    cookieJar: () => cookie
  };
}

async function registerUser(email, { fullName = 'Test User', password = PASSWORD } = {}) {
  const c = client();
  const res = await c.post('/api/auth/register', {
    fullName, email, password, confirmPassword: password, acceptedTerms: true
  });
  assert.equal(res.status, 201, `registering ${email} should succeed: ${JSON.stringify(res.body)}`);
  return { c, user: res.body.user };
}

// The cookie value is "<session id>.<token>"; the id is what the store keys on.
const sessionIdOf = (c) => c.cookieJar().split('=')[1].split('.')[0];

const capturesConsoleLog = (fn) => async (...args) => {
  const lines = [];
  const original = console.log;
  console.log = (...parts) => { lines.push(parts.join(' ')); };
  try {
    const result = await fn(...args);
    return { result, log: lines.join('\n') };
  } finally {
    console.log = original;
  }
};

// ── public surface ───────────────────────────────────────────────────────────

test('the API is reachable and the login screen can read the live password policy', async () => {
  const c = client();
  assert.equal((await c.get('/api/health')).body.ok, true);

  const cfg = await c.get('/api/auth/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.passwordMinLength, 8);
  // No SMTP on the test box, but console echo is on, so the SPA may show the link.
  assert.equal(cfg.body.resetEmailAvailable, true);
});

test('every protected endpoint refuses an anonymous caller', async () => {
  const c = client();
  for (const url of [
    '/api/calls', '/api/leads', '/api/analytics', '/api/products',
    '/api/agent/persona', '/api/workspace/settings', '/api/phone/status'
  ]) {
    const res = await c.get(url);
    assert.equal(res.status, 401, `${url} must not answer without a session`);
    assert.equal(res.body.code, 'unauthenticated');
    assert.ok(!JSON.stringify(res.body).includes('password'), `${url} leaked a credential`);
  }

  assert.equal((await c.post('/api/chat', { messages: [] })).status, 401);
  assert.equal((await c.del('/api/calls/anything')).status, 401);
});

// ── registration ─────────────────────────────────────────────────────────────

test('registration rejects incomplete or weak input before touching the store', async () => {
  const c = client();
  const good = {
    fullName: 'Val Ser', email: 'val@example.com', password: PASSWORD,
    confirmPassword: PASSWORD, acceptedTerms: true
  };

  const cases = [
    [{ fullName: '' }, /full name/i],
    [{ fullName: 'x' }, /full name/i],
    [{ email: 'not-an-email' }, /email/i],
    [{ email: '' }, /email/i],
    [{ phone: 'abc' }, /phone/i],
    [{ password: 'short1!' }, /password/i],
    [{ password: 'letteronly' }, /number or symbol/i],
    [{ password: 'a'.repeat(80) }, /password/i],
    [{ confirmPassword: 'Str0ngPass!99' }, /match/i],
    [{ acceptedTerms: false }, /terms/i]
  ];

  for (const [override, pattern] of cases) {
    const res = await c.post('/api/auth/register', { ...good, ...override });
    assert.equal(res.status, 400, `${JSON.stringify(override)} should have been rejected`);
    assert.match(res.body.error, pattern, `${JSON.stringify(override)} gave an unhelpful message: ${res.body.error}`);
  }

  const users = readJson(path.join(DATA_DIR, 'users.json'), []);
  assert.equal(users.length, 0, 'no rejected attempt may create an account');
});

test('the first account is created, gets an HttpOnly session cookie, and never sees its hash', async () => {
  const c = client();
  const res = await c.post('/api/auth/register', {
    fullName: 'Olivia Owner', email: 'olivia@example.com', phone: '+1 (415) 555-0140',
    password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const { user } = res.body;
  assert.equal(user.email, 'olivia@example.com');
  assert.equal(user.fullName, 'Olivia Owner');
  assert.equal(user.phone, '+1 (415) 555-0140', 'an optional phone is stored as typed, having been validated');
  assert.equal(user.status, 'active');
  assert.ok(user.createdAt && user.updatedAt);
  assert.ok(!('passwordHash' in user) && !('password' in user), 'the account shape must carry no credential');
  assert.ok(!JSON.stringify(res.body).includes('$2a$'), 'a bcrypt hash reached the client');

  const cookie = res.setCookie[0];
  assert.match(cookie, /^vp_session=[^;]+/, 'the session cookie is named and populated');
  assert.match(cookie, /HttpOnly/i, 'the session cookie must not be readable from JS');
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api/i, 'the cookie is scoped to the API, not the whole host');
  assert.match(cookie, /Expires=/, 'a registered device gets a persistent cookie');

  // The account that exists first adopts the pre-auth workspace.
  const stored = readJson(path.join(DATA_DIR, 'users.json'), []);
  assert.equal(stored.length, 1);
  assert.match(stored[0].passwordHash, /^\$2[aby]\$/, 'passwords are bcrypt-hashed at rest');
  assert.notEqual(stored[0].passwordHash, PASSWORD);

  const seeded = await c.get('/api/calls');
  assert.ok(seeded.body.calls.length > 0, 'the first workspace keeps the sample history');
  assert.ok(seeded.body.calls.every((call) => call.userId === user.id));
});

test('a duplicate email is refused, whichever spelling it arrives in', async () => {
  const c = client();
  for (const email of ['olivia@example.com', ' OLIVIA@Example.com ', 'olivia@example.com']) {
    const res = await c.post('/api/auth/register', {
      fullName: 'Copy Cat', email, password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true
    });
    assert.equal(res.status, 409, `${email} should collide with the existing account`);
    assert.equal(res.body.code, 'email_taken');
  }
  assert.equal(readJson(path.join(DATA_DIR, 'users.json'), []).length, 1);
});

test('each later account starts with an empty, private workspace', async () => {
  const { c, user } = await registerUser('mallory@example.com');
  assert.equal((await c.get('/api/calls')).body.calls.length, 0, 'a new account inherits nothing');
  assert.equal((await c.get('/api/leads')).body.leads.length, 0);
  const settings = await c.get('/api/workspace/settings');
  assert.equal(settings.body.settings.customProducts.length, 0);

  const olivia = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'olivia@example.com', password: PASSWORD })
  })).json();
  assert.notEqual(olivia.user.id, user.id);
});

// ── login ────────────────────────────────────────────────────────────────────

test('login accepts the right password and is equally vague about both wrong cases', async () => {
  const c = client();
  const ok = await c.post('/api/auth/login', { email: 'olivia@example.com', password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'olivia@example.com');
  assert.ok(c.cookieJar(), 'login must hand back a session cookie');

  const wrongPassword = await c.post('/api/auth/login', { email: 'olivia@example.com', password: 'Str0ngPass!99' });
  const noSuchUser = await c.post('/api/auth/login', { email: 'ghost@example.com', password: PASSWORD });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.deepEqual(wrongPassword.body, noSuchUser.body, 'a failed login must not reveal whether the account exists');
  assert.equal(wrongPassword.body.code, 'bad_credentials');

  const empty = await c.post('/api/auth/login', { email: 'olivia@example.com' });
  assert.equal(empty.status, 400);
});

test('login normalises the address, so a trailing space is not a different account', async () => {
  const c = client();
  const res = await c.post('/api/auth/login', { email: '  Olivia@Example.COM  ', password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('the session persists across requests, and /me describes only its owner', async () => {
  const { c, user } = await registerUser('walter@example.com');
  const first = await c.get('/api/auth/me');
  assert.equal(first.status, 200);
  assert.equal(first.body.user.id, user.id);

  // A page refresh is just another request with the same cookie.
  const second = await c.get('/api/auth/me');
  assert.equal(second.status, 200);
  assert.equal(second.body.user.id, user.id);
  assert.ok(!('passwordHash' in second.body.user));

  // An attacker replaying the cookie alone (no other header) is the whole point
  // of an opaque bearer session: it works, which is why it is HttpOnly.
  const stolen = await fetch(`${base}/api/auth/me`, { headers: { cookie: c.cookieJar() } });
  assert.equal(stolen.status, 200);
});

test('a tampered or unknown session cookie is rejected, not honoured', async () => {
  const { c } = await registerUser('nia@example.com');
  const forged = await fetch(`${base}/api/auth/me`, {
    headers: { cookie: `vp_session=${sessionIdOf(c)}.${'A'.repeat(43)}` }
  });
  assert.equal(forged.status, 401);
  assert.equal((await forged.json()).code, 'session_expired', 'a recognisable session id with a bad token reads as expired');

  const random = await fetch(`${base}/api/auth/me`, { headers: { cookie: 'vp_session=ses_nope.nope' } });
  assert.equal(random.status, 401);
});

test('logging out revokes the session server-side, not just the cookie', async () => {
  const { c, user } = await registerUser('tess@example.com');
  const sessionId = sessionIdOf(c);
  assert.equal((await c.get('/api/auth/me')).status, 200);

  const out = await c.post('/api/auth/logout', {});
  assert.equal(out.status, 200);
  assert.equal(c.cookieJar(), null, 'the cookie is cleared on the way out');

  // The same value replayed by hand must be dead: revocation is server-side.
  const replay = await fetch(`${base}/api/auth/me`, {
    headers: { cookie: `vp_session=${sessionId}.${'A'.repeat(43)}` }
  });
  assert.equal(replay.status, 401);
  assert.ok(!readJson(SESSIONS_FILE, { sessions: [] }).sessions.some((s) => s.id === sessionId),
    'the session row is removed, not merely marked');

  // A logout ends only that device.
  const other = client();
  assert.equal((await other.post('/api/auth/login', { email: user.email, password: PASSWORD })).status, 200);
  assert.equal((await other.get('/api/auth/me')).status, 200);
});

test('an expired session asks the user to sign in again', async () => {
  const { c, user } = await registerUser('rosa@example.com');
  const sessionId = sessionIdOf(c);

  // Simulate the idle timeout elapsing without waiting for it.
  const store = readJson(SESSIONS_FILE, { sessions: [], resetTokens: [] });
  const session = store.sessions.find((s) => s.id === sessionId);
  assert.ok(session && session.userId === user.id);
  session.expiresAt = Date.now() - 1000;
  writeJson(SESSIONS_FILE, store);

  const res = await c.get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'session_expired', 'the SPA uses this code to redirect to the login page');
});

// ── password change / reset ──────────────────────────────────────────────────

test('changing a password needs the old one and signs out every other device', async () => {
  const { c: laptop } = await registerUser('dana@example.com');
  const phone = client();
  assert.equal((await phone.post('/api/auth/login', { email: 'dana@example.com', password: PASSWORD })).status, 200);

  const wrong = await laptop.post('/api/auth/change-password', {
    currentPassword: 'nope-nope-1', newPassword: 'An0therPass!', confirmPassword: 'An0therPass!'
  });
  assert.equal(wrong.status, 401);
  assert.match(wrong.body.error, /not correct/i);

  const weak = await laptop.post('/api/auth/change-password', {
    currentPassword: PASSWORD, newPassword: 'weak', confirmPassword: 'weak'
  });
  assert.equal(weak.status, 400);

  const same = await laptop.post('/api/auth/change-password', {
    currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD
  });
  assert.equal(same.status, 400);

  const changed = await laptop.post('/api/auth/change-password', {
    currentPassword: PASSWORD, newPassword: 'An0therPass!2', confirmPassword: 'An0therPass!2'
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.otherSessionsEnded, 1);
  assert.ok(!JSON.stringify(changed.body).includes('passwordHash'));

  assert.equal((await laptop.get('/api/auth/me')).status, 200, 'the device that changed it stays signed in');
  assert.equal((await phone.get('/api/auth/me')).status, 401, 'the other device is thrown out');
});

test('a profile edit updates the account and cannot change the email or password', async () => {
  const { c } = await registerUser('amir@example.com');
  const res = await c.patch('/api/auth/me', {
    fullName: 'Amir Khan',
    phone: '+91 98765 43210',
    avatarUrl: 'https://example.com/a.png',
    email: 'someone-else@example.com',
    passwordHash: '$2a$11$injected',
    status: 'disabled',
    id: 'usr-someone-else'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.fullName, 'Amir Khan');
  assert.equal(res.body.user.phone, '+91 98765 43210');
  assert.equal(res.body.user.email, 'amir@example.com', 'the address is not editable here');
  assert.ok(!('passwordHash' in res.body.user));

  const stored = readJson(path.join(DATA_DIR, 'users.json'), []).find((u) => u.email === 'amir@example.com');
  assert.equal(stored.status, 'active', 'a payload cannot disable its own account record');
  assert.ok(!stored.passwordHash.includes('injected'), 'the injected hash never reached the store');

  const badPhone = await c.patch('/api/auth/me', { fullName: 'Amir Khan', phone: '123' });
  assert.equal(badPhone.status, 400);
});

test('forgot-password answers identically for a registered and an unknown address', async () => {
  const c = client();
  const known = await c.post('/api/auth/forgot-password', { email: 'amir@example.com' });
  const unknown = await c.post('/api/auth/forgot-password', { email: 'nobody-at-all@example.com' });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.body.message, unknown.body.message, 'the response must not confirm the account exists');
  assert.match(known.body.message, /if that email address has an account/i);
  assert.ok(!JSON.stringify(known.body).toLowerCase().includes('token'), 'no credential in the answer');

  const invalid = await c.post('/api/auth/forgot-password', { email: 'nope' });
  assert.equal(invalid.status, 400);
});

test('a reset link is real, single-use, and signs nothing back in', async () => {
  const { c, user } = await registerUser('zoe@example.com');
  const before = client();
  assert.equal((await before.post('/api/auth/login', { email: 'zoe@example.com', password: PASSWORD })).status, 200);

  const { log } = await capturesConsoleLog(() =>
    c.post('/api/auth/forgot-password', { email: 'zoe@example.com' })
  )();

  const match = log.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
  assert.ok(match, `no reset link was produced; console was:\n${log}`);
  const token = match[1];
  assert.ok(token.length >= 32, 'a reset token must be long enough to brute force nothing');

  const store = readJson(SESSIONS_FILE, { sessions: [], resetTokens: [] });
  const record = store.resetTokens.find((t) => t.userId === user.id);
  assert.ok(record, 'the token is persisted so it can be revoked');
  assert.ok(!JSON.stringify(record).includes(token), 'only a hash of the token is stored');

  const tooWeak = await c.post('/api/auth/reset-password', { token, password: 'x', confirmPassword: 'x' });
  assert.equal(tooWeak.status, 400, 'a bad new password must not consume the token');

  const reset = await c.post('/api/auth/reset-password', {
    token, password: 'BrandNewPass!7', confirmPassword: 'BrandNewPass!7'
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  // Sign-up made one session and the login above a second; a reset ends both.
  assert.equal(reset.body.sessionsEnded, 2, 'a reset ends the sessions that predate it');
  assert.equal((await c.get('/api/auth/me')).status, 401, 'the link is not a way to stay signed in');

  const replay = await c.post('/api/auth/reset-password', {
    token, password: 'ThirdPass!99', confirmPassword: 'ThirdPass!99'
  });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.code, 'invalid_token', 'the link cannot be used twice');

  assert.equal((await before.post('/api/auth/login', { email: 'zoe@example.com', password: PASSWORD })).status, 401);
  const fresh = client();
  assert.equal((await fresh.post('/api/auth/login', { email: 'zoe@example.com', password: 'BrandNewPass!7' })).status, 200);
  assert.equal((await fresh.get('/api/auth/me')).status, 200);
});

test('an invented or expired reset token is refused', async () => {
  const c = client();
  const bogus = await c.post('/api/auth/reset-password', {
    token: 'A'.repeat(44), password: 'Hacked1234!', confirmPassword: 'Hacked1234!'
  });
  assert.equal(bogus.status, 400);
  assert.equal(bogus.body.code, 'invalid_token');
  assert.equal((await c.post('/api/auth/reset-password', { password: 'Hacked1234!' })).status, 400);
});

// ── throttling ───────────────────────────────────────────────────────────────

test('repeated wrong passwords for one address get throttled, and the block is not an account hint', async () => {
  const { c } = await registerUser('brute@example.com');
  let last = null;
  for (let i = 0; i < 12; i += 1) {
    last = await c.post('/api/auth/login', { email: 'brute@example.com', password: 'wrong-password-1' });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429, 'the login endpoint must stop a password spray');
  assert.equal(last.body.code, 'rate_limited');
  assert.match(last.headers.get('ratelimit') || last.headers.get('x-ratelimit-limit') || '', /./,
    'draft-7 rate limit headers are exposed');

  // A different address on the same machine keeps working, so one targeted
  // attack cannot lock the whole office out.
  const other = client();
  assert.equal((await other.post('/api/auth/login', { email: 'mallory@example.com', password: PASSWORD })).status, 200);
});

// ── cross-tenant isolation ───────────────────────────────────────────────────

test('one account cannot read, edit or delete another account\'s calls', async () => {
  const a = await registerUser('tenant-a@example.com');
  const b = await registerUser('tenant-b@example.com');

  const mine = await a.c.post('/api/calls', {
    id: 'call-tenant-a-1', customerName: 'A Customer', company: 'A Co', status: 'Interested',
    duration: 42, transcript: [{ sender: 'bot', text: 'hi' }, { sender: 'customer', text: 'hello' }],
    summary: { dealScore: 77, overview: 'ok', requirements: [], objections: [], nextSteps: [], sentiment: 'Positive' }
  });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.call.userId, a.user.id);

  // A payload that claims a different owner is ignored, not trusted.
  const hijack = await b.c.post('/api/calls', {
    id: 'call-tenant-b-1', userId: a.user.id, customerName: 'B Customer',
    summary: { dealScore: 12, overview: 'b', requirements: [], objections: [], nextSteps: [], sentiment: 'Neutral' }
  });
  assert.equal(hijack.body.call.userId, b.user.id, 'a client-supplied userId must never decide the owner');

  assert.deepEqual((await a.c.get('/api/calls')).body.calls.map((r) => r.id), ['call-tenant-a-1']);
  assert.deepEqual((await b.c.get('/api/calls')).body.calls.map((r) => r.id), ['call-tenant-b-1']);

  const stolenDelete = await b.c.del('/api/calls/call-tenant-a-1');
  assert.equal(stolenDelete.status, 404, 'another tenant\'s id must read as nonexistent');
  assert.equal((await a.c.get('/api/calls')).body.calls.length, 1, 'and nothing was removed');

  const analyticsA = await a.c.get('/api/analytics');
  const analyticsB = await b.c.get('/api/analytics');
  assert.equal(analyticsA.body.totals.totalCalls, 1);
  assert.equal(analyticsB.body.totals.totalCalls, 1, "B sees only its own single row");
  assert.equal(analyticsA.body.totals.avgDealScore, 77);
  assert.equal(analyticsB.body.totals.avgDealScore, 12, 'A\'s deal score must not reach B\'s analytics');
  assert.ok(!JSON.stringify(analyticsB.body).includes('A Customer'));

  const exportA = await fetch(`${base}/api/export/calls.csv`, { headers: { cookie: a.c.cookieJar() } });
  const csv = await exportA.text();
  assert.match(csv, /A Customer/);
  assert.ok(!csv.includes('B Customer'), 'a CSV export must contain only the requester\'s rows');

  assert.equal((await a.c.del('/api/calls/call-tenant-a-1')).status, 200);
  assert.equal((await a.c.get('/api/calls')).body.calls.length, 0);
});

test('one account cannot read or overwrite another account\'s customers', async () => {
  const a = await registerUser('lead-a@example.com');
  const b = await registerUser('lead-b@example.com');

  const created = await a.c.post('/api/leads', { name: 'Private Prospect', phone: '+14155550170', email: 'p@example.com' });
  assert.equal(created.status, 200);
  const leadId = created.body.lead.id;

  assert.deepEqual((await b.c.get('/api/leads')).body.leads, []);
  assert.equal((await b.c.patch(`/api/leads/${leadId}`, { name: 'Hijacked' })).status, 404);
  assert.equal((await b.c.del(`/api/leads/${leadId}`)).status, 404);
  assert.equal((await a.c.get('/api/leads')).body.leads[0].name, 'Private Prospect');

  // Extracting a customer from a call is scoped the same way.
  const call = await a.c.post('/api/calls', { id: 'call-lead-a', customerName: 'From Call', transcript: [] });
  assert.equal(call.status, 200);
  assert.equal((await b.c.post('/api/leads/extract', { callId: 'call-lead-a' })).status, 404);
});

test('agent configuration is per account, not per device', async () => {
  const a = await registerUser('cfg-a@example.com');
  const b = await registerUser('cfg-b@example.com');

  const made = await a.c.post('/api/workspace/products', {
    name: 'A Product',
    tagline: 'only mine',
    pitch: 'A Product pitches straight to engineering leaders.',
    features: ['one', 'two'],
    pricing: 'free',
    targetCustomer: 'teams'
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const productId = made.body.product.id;

  assert.equal((await a.c.put('/api/workspace/settings', { productKey: productId })).status, 200);

  const bSettings = await b.c.get('/api/workspace/settings');
  assert.equal(bSettings.body.settings.customProducts.length, 0);
  assert.notEqual(bSettings.body.settings.productKey, productId);

  assert.equal((await b.c.del(`/api/workspace/products/${productId}`)).status, 404);
  assert.equal((await a.c.get('/api/workspace/settings')).body.settings.customProducts.length, 1);

  // The product a prompt is built from resolves inside the owner's workspace.
  const persona = await a.c.post('/api/agent/persona', { productKey: productId });
  assert.equal(persona.status, 200);
  assert.match(persona.body.systemPrompt, /A Product/);
});

test('recordings are served only to the account that uploaded them', async () => {
  const a = await registerUser('audio-a@example.com');
  const b = await registerUser('audio-b@example.com');

  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], { type: 'audio/wav' }), 'call.wav');
  const uploaded = await a.c.raw('POST', '/api/recordings/upload', { formData: form });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.match(uploaded.body.url, new RegExp(`^/api/recordings/${a.user.id}/rec-.*\\.wav$`));

  assert.equal((await a.c.get(uploaded.body.url)).status, 200, 'the owner can play their own recording');
  assert.equal((await b.c.get(uploaded.body.url)).status, 404, 'another account cannot');

  // Percent-encoded traversal reaches the handler intact (a plain '../' is
  // collapsed by the client before it is sent), and the basename guard wins.
  const traversal = await a.c.get(`/api/recordings/${a.user.id}/..%2F..%2Fusers.json`);
  assert.equal(traversal.status, 400, 'path traversal must not read outside the owner folder');
  assert.ok(!JSON.stringify(traversal.body).includes('passwordHash'));

  // Anonymous reads of the old public folder are gone entirely.
  const publicPath = await fetch(`${base}${uploaded.body.url}`);
  assert.equal(publicPath.status, 401);
  const legacy = await fetch(`${base}/recordings/${path.basename(uploaded.body.url)}`);
  assert.ok(legacy.status === 404 || legacy.status === 401, 'the unauthenticated /recordings folder must be closed');
});

test('a browser cannot ride another site\'s session into a write', async () => {
  const { c } = await registerUser('csrf@example.com');
  const res = await c.raw('POST', '/api/leads', {
    body: { name: 'CSRF Prospect', phone: '+14155550180' },
    headers: { origin: 'https://evil.example' }
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'origin_not_allowed');
  assert.deepEqual((await c.get('/api/leads')).body.leads, [], 'and nothing was written');

  const self = await c.raw('POST', '/api/leads', {
    body: { name: 'Legit Prospect', phone: '+14155550181' },
    headers: { origin: base }
  });
  assert.equal(self.status, 200);

  // Reads stay allowed: SameSite=Lax is what governs them, and a top-level
  // navigation to an export link must keep working.
  const read = await c.raw('GET', '/api/leads', { headers: { origin: 'https://evil.example' } });
  assert.equal(read.status, 200);
});

test('the store never puts a credential in a file another process can read back as plain text', async () => {
  const users = fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8');
  const sessions = fs.readFileSync(SESSIONS_FILE, 'utf8');
  const workspace = fs.readdirSync(path.join(DATA_DIR, 'users'));
  const bodies = [users, sessions, ...workspace.flatMap((id) => {
    const dir = path.join(DATA_DIR, 'users', id);
    return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  })].join('\n');

  assert.ok(!bodies.includes(PASSWORD), 'a plain password reached the disk');
  for (const row of readJson(path.join(DATA_DIR, 'users.json'), [])) {
    assert.match(row.passwordHash, /^\$2[aby]\$\d{2}\$/, 'passwords are hashed, not encoded');
  }
});

test('saving a call twice updates the row instead of duplicating history', async () => {
  const { c } = await registerUser('dup@example.com');
  const first = await c.post('/api/calls', { id: 'call-dup', customerName: 'Once', duration: 10 });
  const second = await c.post('/api/calls', { id: 'call-dup', customerName: 'Twice', duration: 20 });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const rows = (await c.get('/api/calls')).body.calls;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerName, 'Twice');
  assert.equal(rows[0].duration, 20);
  assert.ok(db.getCallById((await c.get('/api/auth/me')).body.user.id, 'call-dup'));
});
