import { Router } from 'express';

import {
  readWorkspace, updateWorkspace, createCustomProduct, deleteCustomProduct
} from '../controllers/workspace.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);

router.get('/settings', readWorkspace);
router.put('/settings', updateWorkspace);
router.post('/products', createCustomProduct);
router.delete('/products/:id', deleteCustomProduct);

export default router;
