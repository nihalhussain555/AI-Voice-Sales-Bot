import { Router } from 'express';
import { listCalls, createCall, removeCall } from '../controllers/calls.controller.js';

const router = Router();

router.get('/', listCalls);
router.post('/', createCall);
router.delete('/:id', removeCall);

export default router;
