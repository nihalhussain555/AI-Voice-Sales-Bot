import { Router } from 'express';

import { listProducts } from '../controllers/catalog.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listProducts);

export default router;
