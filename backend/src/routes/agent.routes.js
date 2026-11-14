import { Router } from 'express';

import { persona } from '../controllers/agent.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);

// GET for a catalog product, POST so a custom product saved in this user's
// workspace can be shown too.
router.get('/persona', persona);
router.post('/persona', persona);

export default router;
