import { Router } from 'express';

import { listCalls, createCall, removeCall } from '../controllers/calls.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listCalls);
router.post('/', createCall);
router.delete('/:id', removeCall);

export default router;
