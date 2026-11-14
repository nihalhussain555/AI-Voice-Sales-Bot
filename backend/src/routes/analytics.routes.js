import { Router } from 'express';

import { analytics } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', analytics);

export default router;
