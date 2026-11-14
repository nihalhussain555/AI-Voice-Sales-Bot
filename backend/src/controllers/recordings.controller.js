// Call recordings: uploaded by the browser at the end of a session, streamed
// back only to the account that owns them.
//
// These used to sit in one public static folder. Because they carry customer
// conversations they are now served through an authenticated route, addressed as
// /api/recordings/<ownerId>/<file>, and the owner in the URL must match the
// signed-in user.

import fs from 'fs';
import path from 'path';

import { userRecordingsDir } from '../models/store.js';

const MIME = {
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
};

export function uploadRecording(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  // Relative to the API base, so the URL survives a host change; the SPA
  // prefixes it and the browser sends the session cookie with it.
  res.json({ url: `/api/recordings/${req.user.id}/${req.file.filename}` });
}

export function getRecording(req, res, next) {
  const { userId, filename } = req.params;
  if (userId !== req.user.id) {
    // Same answer as "no such file": a difference here would let anyone walk the
    // route and discover which account ids exist.
    return res.status(404).json({ error: 'Recording not found' });
  }

  const base = path.basename(filename || '');
  if (!base || base !== filename) return res.status(400).json({ error: 'Invalid recording name' });

  const file = path.join(userRecordingsDir(userId), base);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Recording not found' });

  // sendFile handles Range requests, which is what makes the player seekable.
  res.sendFile(file, {
    headers: { 'Content-Type': MIME[path.extname(base).toLowerCase()] || 'application/octet-stream' }
  }, (err) => { if (err) next(err); });
}
