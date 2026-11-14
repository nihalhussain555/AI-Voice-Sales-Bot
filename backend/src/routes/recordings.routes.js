import { Router } from 'express';

import { uploadRecording, getRecording } from '../controllers/recordings.controller.js';
import { upload } from '../middleware/upload.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

// Mounted at /api/recordings. These used to be a public express.static folder;
// because they carry customer conversations every read is now authenticated and
// checked against the owner in the path.
router.use(requireAuth);

// The SPA posts the microphone blob here at the end of a browser call.
router.post('/upload', upload.single('audio'), uploadRecording);

router.get('/:userId/:filename', getRecording);

export default router;
