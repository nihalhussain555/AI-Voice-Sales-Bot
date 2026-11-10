import { Router } from 'express';
import { uploadRecording } from '../controllers/recordings.controller.js';
import { upload } from '../middleware/upload.js';

const router = Router();

// Mounted at /api — the SPA posts the microphone blob here at end of call.
router.post('/upload-recording', upload.single('audio'), uploadRecording);

export default router;
