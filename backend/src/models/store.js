// Filesystem layout for authenticated data. Every record a signed-in user
// creates lives inside their own folder, so cross-user reads are impossible by
// construction rather than by a filter that could be forgotten.
//
//   <DATA_DIR>/users.json                 account records (email is the lookup key)
//   <DATA_DIR>/sessions.json              sessions + password-reset tokens
//   <DATA_DIR>/users/<id>/calls.json      that user's call history
//   <DATA_DIR>/users/<id>/leads.json      that user's customer list
//   <DATA_DIR>/users/<id>/settings.json   that user's agent/workspace configuration
//   <RECORDINGS_DIR>/<id>/…               that user's call recordings

import fs from 'fs';
import path from 'path';

import { paths, ensureDataDirs } from '../config/env.js';

ensureDataDirs();

export const USERS_FILE = path.join(paths.data, 'users.json');
export const SESSIONS_FILE = path.join(paths.data, 'sessions.json');

// Ids reach here from stored records, so they are validated before being used
// as a directory name — '../escape' must never become a path.
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

export function assertSafeId(id) {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Refusing to build a path from an unsafe id: ${String(id).slice(0, 40)}`);
  }
  return id;
}

export function userDir(userId) {
  const dir = path.join(paths.data, 'users', assertSafeId(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function userFile(userId, name) {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Unknown collection: ${name}`);
  return path.join(userDir(userId), `${name}.json`);
}

export function userRecordingsDir(userId) {
  const dir = path.join(paths.recordings, assertSafeId(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Write to a sibling temp file then rename: rename is atomic on every platform
// we run on, so a crash mid-write cannot leave a half-written JSON store that
// would read back as an empty workspace.
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error(`store: could not read ${path.basename(file)}:`, err.message);
    return structuredClone(fallback);
  }
}

export function writeJson(file, value) {
  try {
    writeJsonAtomic(file, value);
    return true;
  } catch (err) {
    console.error(`store: could not write ${path.basename(file)}:`, err.message);
    return false;
  }
}

export function readCollection(userId, name, fallback = []) {
  return readJson(userFile(userId, name), fallback);
}

export function writeCollection(userId, name, rows) {
  return writeJson(userFile(userId, name), rows);
}
