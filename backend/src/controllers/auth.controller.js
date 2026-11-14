// Sign-in, registration, password reset and the account endpoints behind the
// profile page.
//
// Two rules run through this whole file. A password hash is never read out of
// the model layer into a response, and a failed login never says which half of
// the credentials was wrong.

import { authConfig, mailConfig } from '../config/env.js';
import {
  createUser, findUserByEmail, findUserById, publicUser, updateUser, verifyPassword, setPassword, countUsers
} from '../models/users.js';
import {
  createSession, encodeSessionCookie, revokeSession, revokeSessionsForUser,
  createResetToken, consumeResetToken
} from '../models/sessions.js';
import { sendMail, resetEmailBody, mailStatus } from '../services/mailer.js';
import { migrateLegacyWorkspaces, seedFirstWorkspace } from '../models/migrate.js';
import { COOKIE_PATH, cookieOptions, clearSessionCookie } from '../middleware/session-cookie.js';
import {
  validateEmail, validateName, validatePassword, validatePhone, validateUrl, firstError, normalizeEmail
} from '../utils/validate.js';

export { COOKIE_PATH };

const bad = (res, message, extra = {}) => res.status(400).json({ error: message, code: 'invalid_input', ...extra });
const unauthorized = (res, message) => res.status(401).json({ error: message, code: 'bad_credentials' });

// The SPA needs to know the live password policy rather than hardcoding one that
// can drift away from the server's.
export function authConfigResponse(req, res) {
  const mail = mailStatus();
  res.json({
    passwordMinLength: authConfig.passwordMinLength,
    phoneOptional: true,
    signupOpen: !authConfig.maxUsers || countUsers() < authConfig.maxUsers,
    // Drives the Forgot-password link: with no SMTP transport on the server the
    // form would only ever fail, so the UI says so instead of hiding it.
    resetEmailAvailable: mail.configured || mailConfig().echoInConsole,
    sessionTtlMinutes: Math.round(authConfig.sessionTtlMs / 60000),
    rememberTtlDays: Math.round(authConfig.rememberTtlMs / 86400000)
  });
}

function issueSession(res, user, { remember, req }) {
  const { session, token } = createSession({
    userId: user.id,
    remember,
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip
  });
  res.cookie(
    authConfig.cookieName,
    encodeSessionCookie(session.id, token),
    cookieOptions({ remember, expiresAt: session.expiresAt })
  );
  return session;
}

export async function register(req, res, next) {
  try {
    const body = req.body || {};
    const name = validateName(body.fullName, { field: 'Full name' });
    const email = validateEmail(body.email);
    const phone = validatePhone(body.phone);
    const password = validatePassword(body.password);

    const fieldsWithErrors = [name.error, email.error, phone.error, password.error];
    const mismatch = body.password && body.confirmPassword && body.password !== body.confirmPassword
      ? 'Both passwords must match'
      : null;
    if (body.password && !body.confirmPassword) fieldsWithErrors.push('Confirm your password');

    const error = firstError(...fieldsWithErrors, mismatch);
    if (error) return bad(res, error);

    // Terms acceptance is recorded, not just required, so there is an audit
    // trail for the checkbox rather than a boolean thrown away on the floor.
    if (body.acceptedTerms !== true) {
      return bad(res, 'Accept the terms and conditions to create an account');
    }

    // createUser owns the account-limit and unique-email rules at the point of
    // writing; a pre-check here would only add a race between two reads.
    const user = await createUser({
      fullName: name.value,
      email: email.value,
      phone: phone.value,
      password: body.password,
      termsAcceptedAt: new Date().toISOString()
    });

    // The first account is the one the pre-authentication workspace belongs to:
    // it inherits any calls/customers already on disk and gets the sample history
    // the single-user build showed. Deliberately done here rather than at boot —
    // seeding on startup would resurrect calls a user has since deleted.
    if (countUsers() === 1) {
      try {
        migrateLegacyWorkspaces();
        seedFirstWorkspace(user.id);
      } catch (err) {
        console.error('auth: could not adopt the pre-auth workspace:', err.message);
      }
    }

    const session = issueSession(res, user, { remember: true, req });
    res.status(201).json({
      user: publicUser(user),
      session: { expiresAt: session.expiresAt, remember: true }
    });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message, code: 'email_taken' });
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const body = req.body || {};
    const email = validateEmail(body.email);
    if (email.error) return bad(res, email.error);
    if (!body.password) return bad(res, 'Password is required');

    const user = findUserByEmail(normalizeEmail(email.value));
    const ok = await verifyPassword(user, body.password);
    if (!ok || !user) {
      // Identical wording and identical work for "no such account" and "wrong
      // password" — see the dummy hash in models/users.js.
      return unauthorized(res, 'Email or password is incorrect');
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This account is disabled. Contact support.', code: 'account_disabled' });
    }

    const remember = Boolean(body.remember);
    const session = issueSession(res, user, { remember, req });
    res.json({
      user: publicUser(user),
      session: { expiresAt: session.expiresAt, remember: session.remember }
    });
  } catch (err) {
    next(err);
  }
}

export function me(req, res) {
  res.json({
    user: req.auth,
    session: { expiresAt: req.sessionExpiresAt || null }
  });
}

export function logout(req, res) {
  if (req.sessionId) revokeSession(req.sessionId);
  clearSessionCookie(res);
  res.json({ success: true });
}

export function updateProfile(req, res, next) {
  try {
    const body = req.body || {};
    const name = validateName(body.fullName);
    const phone = validatePhone(body.phone);
    const avatar = validateUrl(body.avatarUrl, { field: 'Profile picture link' });
    const error = firstError(name.error, phone.error, avatar.error);
    if (error) return bad(res, error);

    const updated = updateUser(req.user.id, {
      fullName: name.value,
      phone: phone.value,
      avatarUrl: avatar.value || null
    });
    if (!updated) return res.status(404).json({ error: 'Account not found' });
    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
}

// Changing a password from the profile page proves knowledge of the old one, so
// every *other* device is signed out and only this session survives.
export async function changePassword(req, res, next) {
  try {
    const body = req.body || {};
    if (!body.currentPassword) return bad(res, 'Your current password is required');
    const fresh = findUserByEmail(req.user.email);
    if (!(await verifyPassword(fresh, body.currentPassword))) {
      return res.status(401).json({ error: 'That current password is not correct', code: 'bad_credentials' });
    }

    const policy = validatePassword(body.newPassword);
    if (policy.error) return bad(res, policy.error);
    if (body.newPassword === body.currentPassword) {
      return bad(res, 'Choose a password you have not used here before');
    }
    if (body.confirmPassword !== undefined && body.newPassword !== body.confirmPassword) {
      return bad(res, 'Both passwords must match');
    }

    const updated = await setPassword(fresh.id, body.newPassword);
    if (!updated) return res.status(500).json({ error: 'Could not save the new password' });
    const removed = revokeSessionsForUser(fresh.id, { exceptId: req.sessionId });

    res.json({
      user: publicUser(updated),
      otherSessionsEnded: removed,
      message: 'Password updated'
    });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const body = req.body || {};
    const email = validateEmail(body.email);
    if (email.error) return bad(res, email.error);

    const sent = 'If that email address has an account, a reset link is on its way. It expires in 30 minutes.';

    const user = findUserByEmail(normalizeEmail(email.value));
    // Unknown address: same answer, same status, and no token written to disk.
    if (!user || user.status !== 'active') {
      return res.json({ message: sent, delivered: false });
    }

    const { token, expiresAt } = createResetToken(user.id);
    const minutes = Math.max(1, Math.round(authConfig.resetTtlMs / 60000));
    const link = `${mailConfig().appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    if (mailStatus().configured) {
      try {
        await sendMail({ to: user.email, ...resetEmailBody({ fullName: user.fullName, link, minutes, appBaseUrl: mailConfig().appBaseUrl }) });
      } catch (err) {
        // A transport failure is reported as a server problem, never as
        // "that address is not registered" — but it must not be dressed up as
        // a successful send either.
        console.error('auth: reset mail failed:', err.message);
        return res.status(502).json({
          error: 'We could not send the reset email. Please try again shortly.',
          code: 'mail_failed'
        });
      }
    } else if (mailConfig().echoInConsole) {
      // No SMTP on this box (local development). The token is real, stored and
      // single-use; only its delivery is local. Never written to a response.
      console.log(`\n[auth] password reset link for ${user.email} (SMTP not configured):\n  ${link}\n  expires ${new Date(expiresAt).toISOString()}\n`);
    } else {
      console.warn(`auth: reset requested for ${user.email} but no mail transport is configured`);
    }

    res.json({ message: sent, delivered: mailStatus().configured });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const body = req.body || {};
    if (!body.token) return bad(res, 'This reset link is not valid. Request a new one from the sign-in page.');

    // The new password is checked before the link is spent: burning a
    // single-use token on a too-short password would force a detour through
    // email just to fix a typo.
    const policy = validatePassword(body.password);
    if (policy.error) return bad(res, policy.error);
    if (body.confirmPassword !== undefined && body.confirmPassword !== body.password) {
      return bad(res, 'Both passwords must match');
    }

    const record = consumeResetToken(body.token);
    if (!record) {
      return res.status(400).json({
        error: 'This reset link has expired or already been used. Request a new one.',
        code: 'invalid_token'
      });
    }

    const user = findUserById(record.userId);
    if (!user || user.status !== 'active') {
      return res.status(400).json({ error: 'That account can no longer be reset here', code: 'invalid_token' });
    }

    const updated = await setPassword(user.id, body.password);
    if (!updated) return res.status(500).json({ error: 'Could not save the new password' });

    // A reset is the recovery path for a compromised account, so nothing that
    // was signed in before it survives.
    const ended = revokeSessionsForUser(user.id);
    clearSessionCookie(res);

    res.json({ message: 'Password updated. Sign in with your new password.', sessionsEnded: ended });
  } catch (err) {
    next(err);
  }
}
