// Ephemeral credentials: signed-in sessions and password-reset tokens.
//
// Both are opaque random values, stored only as SHA-256 hashes. That keeps the
// flow revocable server-side (unlike a self-contained JWT, a session can be
// killed the moment a password changes) and means reading sessions.json is not
// enough to mint a valid cookie.

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { authConfig } from '../config/env.js';
import { SESSIONS_FILE, readJson, writeJson } from './store.js';

const MAX_SESSIONS_PER_USER = 10;
const PRUNE_EVERY = 200; // write counter

let writes = 0;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

const newId = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;

function blank() {
  return { sessions: [], resetTokens: [] };
}

function readStore() {
  const raw = readJson(SESSIONS_FILE, blank());
  return {
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    resetTokens: Array.isArray(raw.resetTokens) ? raw.resetTokens : []
  };
}

function save(store) {
  const now = Date.now();
  writes += 1;
  let next = store;
  if (writes % PRUNE_EVERY === 0) {
    next = {
      sessions: store.sessions.filter((s) => s.expiresAt > now),
      resetTokens: store.resetTokens.filter((t) => t.expiresAt > now && !t.usedAt)
    };
  }
  return writeJson(SESSIONS_FILE, next);
}

// ── Cookie value ─────────────────────────────────────────────────────────────

export function encodeSessionCookie(sessionId, token) {
  return `${sessionId}.${token}`;
}

export function decodeSessionCookie(value) {
  if (typeof value !== 'string') return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  return { sessionId: value.slice(0, dot), token: value.slice(dot + 1) };
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createSession({ userId, remember = false, userAgent = null, ip = null } = {}) {
  if (!userId) throw new Error('createSession requires a userId');
  const store = readStore();
  const now = Date.now();
  const ttl = remember ? authConfig.rememberTtlMs : authConfig.sessionTtlMs;
  const token = randomBytes(32).toString('base64url');

  const session = {
    id: newId('ses'),
    userId,
    tokenHash: sha256(token),
    remember: Boolean(remember),
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: now + ttl,
    userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
    ip: ip ? String(ip).slice(0, 45) : null
  };

  // Only this user's sessions are capped — one heavy user must not be able to
  // grow the file without bound.
  const mine = store.sessions.filter((s) => s.userId === userId);
  store.sessions = [
    ...store.sessions.filter((s) => s.userId !== userId),
    ...[...mine, session].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_SESSIONS_PER_USER)
  ];
  save(store);

  return { session, token };
}

// Returns { session, needsRefresh } on success, null for any failure. Every
// failure is the same answer to the caller: an expired, revoked, tampered or
// unknown session must not be distinguishable.
export function validateSession(sessionId, token) {
  const { sessions } = readStore();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || session.expiresAt <= Date.now()) return null;

  const expected = Buffer.from(session.tokenHash, 'utf8');
  const received = Buffer.from(sha256(token), 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  const ttl = session.remember ? authConfig.rememberTtlMs : authConfig.sessionTtlMs;
  // Sliding expiry, refreshed once half the window is gone so ordinary requests
  // do not rewrite the store every time.
  const needsRefresh = session.expiresAt - Date.now() < ttl / 2;
  return { session, needsRefresh, ttl };
}

export function touchSession(sessionId) {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const now = Date.now();
  const ttl = session.remember ? authConfig.rememberTtlMs : authConfig.sessionTtlMs;
  session.lastSeenAt = new Date(now).toISOString();
  session.expiresAt = now + ttl;
  save(store);
  return session;
}

export function revokeSession(sessionId) {
  const store = readStore();
  const next = store.sessions.filter((s) => s.id !== sessionId);
  if (next.length === store.sessions.length) return false;
  store.sessions = next;
  save(store);
  return true;
}

// Used after a password change/reset: every other device is signed out, the
// caller's own session survives so they are not thrown out mid-action.
export function revokeSessionsForUser(userId, { exceptId = null } = {}) {
  const store = readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.userId !== userId || s.id === exceptId);
  save(store);
  return before - store.sessions.length;
}

export function countSessions(userId) {
  return readStore().sessions.filter((s) => s.userId === userId && s.expiresAt > Date.now()).length;
}

// ── Password-reset tokens ────────────────────────────────────────────────────

export function createResetToken(userId, { ttlMs = authConfig.resetTtlMs } = {}) {
  const store = readStore();
  const now = Date.now();
  const token = randomBytes(32).toString('base64url');
  const record = {
    tokenHash: sha256(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + ttlMs,
    usedAt: null
  };
  // A fresh request supersedes earlier ones, so an old link in an inbox cannot
  // be used after the user asked for a new one.
  store.resetTokens = [...store.resetTokens.filter((t) => t.userId !== userId), record];
  save(store);
  return { token, expiresAt: record.expiresAt };
}

function findResetToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const candidate = Buffer.from(sha256(token), 'utf8');
  for (const record of readStore().resetTokens) {
    const expected = Buffer.from(record.tokenHash, 'utf8');
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) return record;
  }
  return null;
}

// Single use: the token is marked consumed here, in the same store write that
// removes every other outstanding token for the account.
export function consumeResetToken(token) {
  const store = readStore();
  const record = store.resetTokens.find((t) => {
    const expected = Buffer.from(t.tokenHash, 'utf8');
    const candidate = Buffer.from(sha256(token || ''), 'utf8');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  });
  if (!record || record.usedAt || record.expiresAt <= Date.now()) return null;

  record.usedAt = new Date().toISOString();
  store.resetTokens = store.resetTokens.filter((t) => t.userId !== record.userId);
  save(store);
  return record;
}

export function resetTokenValid(token) {
  const record = findResetToken(token);
  return record && !record.usedAt && record.expiresAt > Date.now() ? record : null;
}
