import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldAlert } from 'lucide-react';

import AuthLayout, { AuthSwitch, FormNote } from '../../components/auth/AuthLayout.jsx';
import PasswordField from '../../components/auth/PasswordField.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useAuth } from '../../context/auth.jsx';
import { api } from '../../services/api.js';
import { validatePassword, firstError } from '../../lib/validation.js';

// Reached only from the link in the reset email: /reset-password?token=…
//
// The token is a credential, so it is read from the query string and kept in
// this component's state only. It is never written to a URL the app navigates
// to, cached, or logged.
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const navigate = useNavigate();
  const { policy } = useAuth();

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const minLength = policy?.passwordMinLength ?? 8;
  const invalidLink = !token;

  const set = (key) => (value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: null } : e));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || invalidLink) return;

    const next = {
      password: validatePassword(form.password, { minLength }),
      confirmPassword: form.confirmPassword === form.password
        ? null
        : 'Both passwords must match'
    };
    if (firstError(next.password, next.confirmPassword)) {
      setErrors(next);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);

    try {
      await api.resetPassword({ token, password: form.password, confirmPassword: form.confirmPassword });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 4000);
    } catch (err) {
      // An spent or expired link is not recoverable from this form, so say where
      // to go instead of letting the user retry a dead token.
      if (err.code === 'invalid_token') setFormError(err.message);
      else setErrors({ password: err.message });
      setBusy(false);
    }
  };

  if (invalidLink) {
    return (
      <AuthLayout
        title="This reset link is not usable"
        subtitle="A reset link has to carry its token. Yours arrived without one."
        footer={<AuthSwitch prompt="Need another?" label="Request a new link" to="/forgot-password" />}
      >
        <div className="rounded-card border border-danger/40 bg-danger/10 px-4 py-5">
          <span className="mb-2 flex items-center gap-2 text-[13px] font-bold text-danger">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            Link incomplete
          </span>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Copy the whole URL from the email, including everything after
            <code className="mx-1 rounded bg-surface-3 px-1 py-0.5 text-[11px] text-ink">?token=</code>,
            or open the button inside the message itself. Links that were typed by hand
            are usually missing the token.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        subtitle="Every other device signed out of this account has to use the new password."
      >
        <div className="space-y-5 text-center">
          <div className="rounded-card border border-success/40 bg-success/10 px-4 py-5">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
              <KeyRound className="w-5 h-5 text-success" aria-hidden="true" />
            </span>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              That link is now spent and cannot be used again.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-field bg-primary px-4 py-3 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
          >
            Sign in now
          </Link>
          <p className="text-[11px] text-ink-muted">…or you will be taken there automatically.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Set a password that has not been used on this account before."
      footer={<AuthSwitch prompt="Link expired?" label="Request a new one" to="/forgot-password" />}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormNote>{formError}</FormNote>

        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint={`At least ${minLength} characters, not letters only.`}
          showStrength
          disabled={busy}
        />

        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={set('confirmPassword')}
          error={errors.confirmPassword}
          disabled={busy}
        />

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {!busy && <KeyRound className="w-4 h-4" aria-hidden="true" />}
          {busy ? 'Updating' : 'Update password'}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-ink-muted">
          A weak or mismatched password is rejected without spending this link, so a typo
          does not cost you a trip back through your inbox.
        </p>
      </form>
    </AuthLayout>
  );
}
