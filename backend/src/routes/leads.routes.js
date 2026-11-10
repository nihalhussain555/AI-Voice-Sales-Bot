import { Router } from 'express';
import { listLeads, createLead, patchLead, removeLead, extractLead } from '../controllers/leads.controller.js';

const router = Router();

// Registered before the /:id routes so POST /extract is never treated as an id.
router.get('/', listLeads);
router.post('/extract', extractLead);
router.post('/', createLead);
router.patch('/:id', patchLead);
router.delete('/:id', removeLead);

export default router;
