import { Router } from 'express';
import { summarize } from '../controllers/summarize.controller.js';

const router = Router();

router.post('/', summarize);

export default router;
