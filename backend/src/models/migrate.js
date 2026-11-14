// One-time adoption of the data this app kept before accounts existed.
//
// calls.json / leads.json used to be a single shared workspace. On the first
// run after authentication is switched on, their contents move into the first
// registered account and the originals are renamed rather than deleted, so a
// migration is always reversible by renaming them back.

import fs from 'fs';
import path from 'path';

import { paths } from '../config/env.js';
import { readJson, writeJson, readCollection, writeCollection, userRecordingsDir } from './store.js';
import { firstUserId } from './users.js';
import { SEED_CALLS } from './seed.js';

const LEGACY_CALLS = path.join(paths.data, 'calls.json');
const LEGACY_LEADS = path.join(paths.data, 'leads.json');
const MARKER = path.join(paths.data, 'workspace-migration.json');

function retire(file) {
  const backup = `${file}.pre-auth-backup`;
  try {
    fs.renameSync(file, backup);
    return backup;
  } catch (err) {
    console.error(`migrate: could not set aside ${path.basename(file)}:`, err.message);
    return null;
  }
}

export function migrationState() {
  return readJson(MARKER, null);
}

// A recording uploaded before accounts existed sits in the shared folder; it
// moves next to its new owner and its URL is rewritten to the authenticated
// route that now serves it.
function moveRecordings(userId, calls) {
  const target = userRecordingsDir(userId);
  let moved = 0;
  for (const call of calls) {
    const url = call.recordingUrl;
    if (typeof url !== 'string' || !url.startsWith('/recordings/')) continue;
    const base = path.basename(url);
    const source = path.join(paths.recordings, base);
    if (!fs.existsSync(source)) continue;
    try {
      fs.renameSync(source, path.join(target, base));
      call.recordingUrl = `/api/recordings/${userId}/${base}`;
      moved += 1;
    } catch (err) {
      console.warn(`migrate: recording ${base} stayed in place (${err.message})`);
    }
  }
  return moved;
}

// Safe to call on every boot and after every registration: it does nothing once
// the marker exists, and nothing until there is an account to own the data.
export function migrateLegacyWorkspaces() {
  if (migrationState()) return { ran: false, reason: 'already-migrated' };

  const owner = firstUserId();
  if (!owner) return { ran: false, reason: 'no-account-yet' };

  const hasLegacyCalls = fs.existsSync(LEGACY_CALLS);
  const hasLegacyLeads = fs.existsSync(LEGACY_LEADS);

  if (!hasLegacyCalls && !hasLegacyLeads) {
    writeJson(MARKER, { ranAt: new Date().toISOString(), ownerId: owner, calls: 0, leads: 0, recordingsMoved: 0 });
    return { ran: true, reason: 'nothing-to-migrate', ownerId: owner };
  }

  const legacyCalls = hasLegacyCalls ? readJson(LEGACY_CALLS, []) : [];
  const legacyLeads = hasLegacyLeads ? readJson(LEGACY_LEADS, []) : [];
  const adoptedCalls = Array.isArray(legacyCalls) ? legacyCalls : [];
  const adoptedLeads = Array.isArray(legacyLeads) ? legacyLeads : [];

  const mergedCalls = [...readCollection(owner, 'calls', [])];
  for (const call of adoptedCalls) {
    if (!mergedCalls.some((c) => c.id === call.id)) mergedCalls.push(call);
  }
  const mergedLeads = [...readCollection(owner, 'leads', [])];
  for (const lead of adoptedLeads) {
    if (!mergedLeads.some((l) => l.id === lead.id)) mergedLeads.push(lead);
  }

  const recordingsMoved = moveRecordings(owner, mergedCalls);
  for (const call of mergedCalls) call.userId = owner;
  for (const lead of mergedLeads) lead.userId = owner;

  writeCollection(owner, 'calls', mergedCalls);
  writeCollection(owner, 'leads', mergedLeads);

  const backups = [hasLegacyCalls && retire(LEGACY_CALLS), hasLegacyLeads && retire(LEGACY_LEADS)].filter(Boolean);
  writeJson(MARKER, {
    ranAt: new Date().toISOString(),
    ownerId: owner,
    calls: mergedCalls.length,
    leads: mergedLeads.length,
    recordingsMoved,
    backups
  });

  console.log(`migrate: adopted ${mergedCalls.length} calls and ${mergedLeads.length} customers into the first account (${backups.length} legacy files set aside)`);
  return { ran: true, ownerId: owner, calls: mergedCalls.length, leads: mergedLeads.length };
}

// A brand-new install has no history at all. Give the first account the same
// sample conversations the single-user build showed, so the dashboard is not
// empty on the very first look — and only the first account, never a new one.
export function seedFirstWorkspace(userId) {
  if (!userId) return false;
  if (readCollection(userId, 'calls', []).length) return false;
  writeCollection(userId, 'calls', SEED_CALLS.map((call) => ({ ...call, userId })));
  return true;
}
