// Call history. One file per authenticated user, under
// <DATA_DIR>/users/<id>/calls.json — see models/store.js for the layout.
//
// Every function here takes the owner's id as its first argument on purpose:
// there is no "all calls" view anywhere in the product, so a controller cannot
// accidentally reach past the signed-in user.

import path from 'path';
import fs from 'fs';

import { readCollection, writeCollection, userRecordingsDir } from './store.js';

const COLLECTION = 'calls';

const byNewest = (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

function read(userId) {
  const rows = readCollection(userId, COLLECTION, []);
  return Array.isArray(rows) ? rows : [];
}

export const db = {
  getCalls: (userId) => read(userId).sort(byNewest),

  getCallById: (userId, id) => read(userId).find((c) => c.id === id) || null,

  saveCall: (userId, callData) => {
    const calls = read(userId);
    const newCall = {
      // Phone/CRM fields (channel, callSid, direction, from, to, mode, outcome…)
      // must survive, so start from the payload and only fill in defaults.
      ...callData,
      id: callData.id || `call-${Date.now()}`,
      // The owner is a path, not a field — and any client-supplied userId in the
      // body is overwritten here so a payload cannot claim another workspace.
      userId,
      timestamp: callData.timestamp || new Date().toISOString(),
      customerName: callData.customerName || "Customer",
      company: callData.company || "Enterprise Lead",
      product: callData.product || "DevPulse AI",
      language: callData.language || "English",
      duration: callData.duration || 0,
      status: callData.status || "Follow-up Required",
      recordingUrl: callData.recordingUrl || null,
      transcript: Array.isArray(callData.transcript) ? callData.transcript : [],
      summary: callData.summary || {
        overview: "No summary generated.",
        requirements: [],
        objections: [],
        nextSteps: [],
        sentiment: "Neutral",
        dealScore: 50
      }
    };

    // Re-saving the same id (a phone call finalised twice, a browser retry)
    // replaces the row instead of duplicating it.
    const existingIdx = calls.findIndex((c) => c.id === newCall.id);
    if (existingIdx !== -1) calls[existingIdx] = newCall;
    else calls.unshift(newCall);

    writeCollection(userId, COLLECTION, calls);
    return newCall;
  },

  // Returns the removed call, or null when the id is not in this workspace —
  // which is also the answer for another user's id, so probing cannot map
  // somebody else's history.
  deleteCall: (userId, id) => {
    const calls = read(userId);
    const index = calls.findIndex((c) => c.id === id);
    if (index === -1) return null;

    const [removed] = calls.splice(index, 1);
    writeCollection(userId, COLLECTION, calls);

    if (removed.recordingUrl) {
      const file = path.join(userRecordingsDir(userId), path.basename(removed.recordingUrl));
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (err) { console.warn(`calls: could not delete recording: ${err.message}`); }
      }
    }
    return removed;
  }
};
