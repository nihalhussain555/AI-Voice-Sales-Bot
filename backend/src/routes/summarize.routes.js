import { Router } from 'express';

import { summarize } from '../controllers/summarize.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);
router.post('/', summarize);

export default router;
