import { Router } from 'express';
import { analytics } from '../controllers/analytics.controller.js';

const router = Router();

router.get('/', analytics);

export default router;
