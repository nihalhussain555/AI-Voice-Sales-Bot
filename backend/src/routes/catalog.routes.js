import { Router } from 'express';
import { listProducts } from '../controllers/catalog.controller.js';

const router = Router();

router.get('/', listProducts);

export default router;
