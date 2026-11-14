import { Router } from 'express';

import { callsCsvFile, callsJsonFile, leadsCsvFile } from '../controllers/export.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

// These are downloaded through a plain browser link, so the session cookie must
// be sent with a top-level navigation — SameSite=Lax permits exactly that.
router.use(requireAuth);
router.get('/calls.csv', callsCsvFile);
router.get('/calls.json', callsJsonFile);
router.get('/leads.csv', leadsCsvFile);

export default router;
