import { Router } from 'express';
import { persona } from '../controllers/agent.controller.js';

const router = Router();

// GET for a catalog product, POST so a browser-side custom product can be shown too.
router.get('/persona', persona);
router.post('/persona', persona);

export default router;
