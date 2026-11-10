import { Router } from 'express';
import {
  phoneConfig,
  phoneDial,
  phoneCalls,
  phoneCall,
  phoneCallRefresh,
  phoneCallHangup
} from '../controllers/phone.controller.js';

const router = Router();

router.get('/config', phoneConfig);
router.post('/dial', phoneDial);
router.get('/calls', phoneCalls);
router.get('/calls/:callSid', phoneCall);
router.post('/calls/:callSid/refresh', phoneCallRefresh);
router.post('/calls/:callSid/hangup', phoneCallHangup);

export default router;
