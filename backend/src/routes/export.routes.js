import { Router } from 'express';
import { callsCsvFile, callsJsonFile, leadsCsvFile } from '../controllers/export.controller.js';

const router = Router();

router.get('/calls.csv', callsCsvFile);
router.get('/calls.json', callsJsonFile);
router.get('/leads.csv', leadsCsvFile);

export default router;
