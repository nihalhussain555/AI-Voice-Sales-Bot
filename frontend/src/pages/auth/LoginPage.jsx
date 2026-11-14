import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

import AuthLayout, { AuthSwitch, FormNote } from '../../components/auth/AuthLayout.jsx';
import PasswordField from '../../components/auth/PasswordField.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Field, Input } from '../../components/ui/input.jsx';
import { useAuth } from '../../context/auth.jsx';
import { validateEmail } from '../../lib/validation.js';

// Only ever navigate to a path inside this app; a query param from a link
// someone pasted is not allowed to become "//evil.example".
function safeNext(value) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/overview';
}

export default function LoginPage() {
  const { login, policy, sessionEnded, clearSessionEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const next = safeNext(location.state?.next);

  // The banner explaining an idle timeout is only true right after the redirect,
  // so it is cleared as soon as this page stops being visible.
  useEffect(() => () => clearSessionEnded(), [clearSessionEnded]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: null } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;

    const emailError = validateEmail(form.email);
    const passwordError = form.password ? null : 'Password is required';
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);

    try {
      await login({ email: form.email, password: form.password, remember: form.remember });
      navigate(next, { replace: true });
    } catch (err) {
      // A 401 is deliberately vague on purpose — the server will not say whether
      // the email or the password was the wrong half, so neither does the form.
      if (err.status === 401) setErrors({ password: err.message });
      else if (err.status === 0 || err.status === 429 || err.status >= 500) setFormError(err.message);
      else setFormError(err.message || 'Sign in failed.');
      setBusy(false);
    }
    // On success the component unmounts with the redirect, so no finally.
  };

  return (
    <AuthLayout
      title="Sign in to VoicePitch AI"
      subtitle="Your campaigns, calls and agent settings are behind this account."
      footer={<AuthSwitch prompt="New here?" label="Create an account" to="/register" />}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {sessionEnded && (
          <FormNote tone="info">You were signed out after a period of inactivity. Sign in again to continue.</FormNote>
        )}
        <FormNote>{formError}</FormNote>

        <Field label="Email" htmlFor="login-email" error={errors.email}>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={set('email')}
            invalid={Boolean(errors.email)}
            disabled={busy}
          />
        </Field>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PasswordField
              label="Password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(v) => { setForm(f => ({ ...f, password: v })); setErrors(e => (e.password ? { ...e, password: null } : e)); }}
              error={errors.password}
              disabled={busy}
            />
          </div>
          {policy?.resetEmailAvailable !== false && (
            <Link
              to="/forgot-password"
              className="mb-2.5 shrink-0 text-[11px] font-semibold text-primary hover:text-primary-hover underline-offset-4 hover:underline"
            >
              Forgot?
            </Link>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 select-none">
          <input
            type="checkbox"
            name="remember"
            checked={form.remember}
            onChange={set('remember')}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface-3 accent-[rgb(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <span className="text-[12px] leading-relaxed text-ink-muted">
            Keep me signed in on this device
            {policy?.rememberTtlDays
              ? <span className="text-ink-muted/70"> (about {policy.rememberTtlDays} days; otherwise your session ends when it goes idle)</span>
              : null}
          </span>
        </label>

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {!busy && <LogIn className="w-4 h-4" aria-hidden="true" />}
          {busy ? 'Signing in' : 'Sign in'}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-ink-muted">
          Repeated wrong passwords are rate-limited per email and address, so a
          guessed list cannot be tried against this form.
        </p>
      </form>
    </AuthLayout>
  );
}
