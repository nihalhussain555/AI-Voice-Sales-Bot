// Multer memory storage for customer CSV imports.
//
// Unlike recordings, a customer file is parsed immediately and never kept on
// disk, so it goes to memory with a hard size cap rather than the disk storage
// used for audio.

import multer from 'multer';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = /\.(csv|tsv|txt)$/i;
const ALLOWED_MIME = [
  'text/csv', 'text/plain', 'application/vnd.ms-excel',
  'text/tab-separated-values', 'application/octet-stream', ''
];

export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const extOk = ALLOWED_EXT.test(file.originalname || '');
    const mimeOk = ALLOWED_MIME.includes(file.mimetype);
    if (!extOk && !mimeOk) {
      const err = new Error('Only .csv, .tsv or .txt customer files can be imported');
      err.status = 415;
      return cb(err);
    }
    cb(null, true);
  }
}).single('file');
