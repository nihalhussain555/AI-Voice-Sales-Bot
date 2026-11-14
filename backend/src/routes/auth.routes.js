import { Router } from 'express';

import { requireAuth } from '../middleware/require-auth.js';
import { loginLimiter, signupLimiter, forgotLimiter, resetLimiter, sensitiveLimiter } from '../middleware/rate-limit.js';
import {
  authConfigResponse, register, login, logout, me, updateProfile,
  changePassword, forgotPassword, resetPassword
} from '../controllers/auth.controller.js';

const router = Router();

// Public: the SPA reads the live password policy before it renders a form, so
// client and server rules cannot drift apart.
router.get('/config', authConfigResponse);

router.post('/register', signupLimiter, register);
router.post('/login', loginLimiter, login);
// Both reset endpoints answer the same way whether or not the address is known.
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);

router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.patch('/me', requireAuth, sensitiveLimiter, updateProfile);
router.post('/change-password', requireAuth, sensitiveLimiter, changePassword);

export default router;
