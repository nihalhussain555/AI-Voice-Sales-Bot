// Multer disk storage for browser call recordings. Each file lands inside the
// uploading user's own recordings folder, so one account cannot overwrite or
// read another's audio by guessing a filename.

import path from 'path';
import multer from 'multer';

import { userRecordingsDir } from '../models/store.js';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      cb(null, userRecordingsDir(req.user.id));
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    // Derive extension from the actual mime type so WAV/OGG blobs are not
    // mislabeled as .webm (which broke playback of synthetic-audio recordings).
    const mimeExtMap = {
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac'
    };
    const ext = mimeExtMap[file.mimetype] || (path.extname(file.originalname) || '.webm');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'rec-' + uniqueSuffix + ext);
  }
});

export const upload = multer({ storage });
