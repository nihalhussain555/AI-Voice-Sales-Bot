// Account records. bcrypt hashing is deliberately the async API: this process
// also carries live Twilio audio over a websocket, and a synchronous hash on
// the login path would stall it for ~100ms.

import { randomBytes } from 'crypto';

import bcrypt from 'bcryptjs';

import { authConfig } from '../config/env.js';
import { USERS_FILE, readJson, writeJson } from './store.js';
import { normalizeEmail } from '../utils/validate.js';

export const ACCOUNT_STATUS = ['active', 'disabled'];

const BCRYPT_ROUNDS = 11;

// A real hash of a value nobody can ever submit, compared against when the
// email does not exist. Without it, a wrong email answers faster than a wrong
// password and the API becomes an account-enumeration oracle.
const DUMMY_HASH = '$2a$11$b4YyHscPavGEihNrjlSvceR6A.rU/6CZ4m6nD3D7e7lcday0Lqmfq';

let index = null; // lowercased email -> user id

function readUsers() {
  const rows = readJson(USERS_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function buildIndex(rows) {
  const map = new Map();
  for (const user of rows) {
    if (user?.email) map.set(normalizeEmail(user.email), user.id);
  }
  return map;
}

function all() {
  if (!index) index = buildIndex(readUsers());
  return index;
}

export function publicUser(user) {
  if (!user) return null;
  // passwordHash is never part of this object, so a stale hash cannot leak
  // through a controller that forgot to strip it.
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    avatarUrl: user.avatarUrl || null,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function countUsers() {
  return readUsers().length;
}

export function findUserByEmail(email) {
  const id = all().get(normalizeEmail(email));
  if (!id) return null;
  return readUsers().find((u) => u.id === id) || null;
}

export function findUserById(id) {
  if (!id) return null;
  return readUsers().find((u) => u.id === id) || null;
}

// The first registered account owns data that predates authentication, and
// inbound phone calls (which arrive from Twilio, with no session to attribute)
// are recorded in the same workspace.
export function firstUserId() {
  const rows = readUsers();
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0].id;
}

export function emailTaken(email) {
  return all().has(normalizeEmail(email));
}

export async function createUser({ fullName, email, phone = '', password, termsAcceptedAt = null }) {
  const rows = readUsers();
  const normalized = normalizeEmail(email);
  if (rows.some((u) => normalizeEmail(u.email) === normalized)) {
    const err = new Error('An account with that email already exists');
    err.status = 409;
    err.code = 'email_taken';
    throw err;
  }
  if (authConfig.maxUsers && rows.length >= authConfig.maxUsers) {
    const err = new Error('This VoicePitch AI instance is at its account limit');
    err.status = 503;
    throw err;
  }

  const now = new Date().toISOString();
  const user = {
    id: newUserId(),
    fullName,
    email: normalized,
    phone: phone || '',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    avatarUrl: null,
    status: 'active',
    termsAcceptedAt,
    createdAt: now,
    updatedAt: now
  };

  rows.push(user);
  if (!writeJson(USERS_FILE, rows)) {
    const err = new Error('Could not save the account');
    err.status = 500;
    throw err;
  }
  index = buildIndex(rows);
  return user;
}

export async function verifyPassword(user, password) {
  if (!user || user.status !== 'active') {
    await bcrypt.compare(password || '', DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password || '', user.passwordHash || DUMMY_HASH);
}

export function updateUser(id, patch) {
  const rows = readUsers();
  const idx = rows.findIndex((u) => u.id === id);
  if (idx === -1) return null;

  const next = { ...rows[idx] };
  if (patch.fullName !== undefined) next.fullName = patch.fullName;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.avatarUrl !== undefined) next.avatarUrl = patch.avatarUrl;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.passwordHash !== undefined) next.passwordHash = patch.passwordHash;
  if (patch.status !== undefined && ACCOUNT_STATUS.includes(patch.status)) next.status = patch.status;
  next.updatedAt = new Date().toISOString();

  rows[idx] = next;
  if (!writeJson(USERS_FILE, rows)) return null;
  index = buildIndex(rows);
  return next;
}

export function setPassword(id, password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS).then((hash) => updateUser(id, { passwordHash: hash }));
}

// Ids double as filesystem directory names, so they stay inside the safe alphabet.
function newUserId() {
  return `usr-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}
