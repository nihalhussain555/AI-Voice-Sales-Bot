import { Router } from 'express';

import { listLeads, createLead, patchLead, removeLead, extractLead, importCustomers } from '../controllers/leads.controller.js';
import { uploadCsv } from '../middleware/csv-upload.js';
import { requireAuth } from '../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);

// Registered before the /:id routes so POST /extract is never treated as an id.
router.get('/', listLeads);
router.post('/extract', extractLead);
// Multer rejects oversize or non-spreadsheet files; forward those to apiError.
router.post('/import', (req, res, next) => uploadCsv(req, res, (err) => (err ? next(err) : next())), importCustomers);
router.post('/', createLead);
router.patch('/:id', patchLead);
router.delete('/:id', removeLead);

export default router;
