import React, { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';

import AuthLayout, { AuthSwitch, FormNote } from '../../components/auth/AuthLayout.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Field, Input } from '../../components/ui/input.jsx';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/auth.jsx';
import { validateEmail } from '../../lib/validation.js';

export default function ForgotPasswordPage() {
  const { policy } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = validateEmail(email);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setBusy(true);
    try {
      const data = await api.forgotPassword(email.trim());
      // The server answers identically whether or not the address is registered,
      // so this message is the whole result — there is nothing to infer from it.
      setSent(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email on your account. We send a single-use link that expires in 30 minutes."
      footer={
        <>
          {policy?.resetEmailAvailable === false && (
            <FormNote>
              This server has no mail transport configured, so a reset link cannot be
              delivered here. Ask whoever runs this instance to set the SMTP variables,
              or to reset the account directly.
            </FormNote>
          )}
          <div className="mt-3">
            <AuthSwitch prompt="Remembered it?" label="Back to sign in" to="/login" />
          </div>
        </>
      }
    >
      {sent ? (
        <div className="space-y-5">
          <div className="rounded-card border border-success/40 bg-success/10 px-4 py-5 text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
              <Mail className="w-5 h-5 text-success" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-bold text-ink">Check your inbox</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{sent}</p>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            Nothing arrived? Look in spam, then use the form again below — a fresh link
            replaces the previous one.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setSent(null)}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Send it to a different address
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" htmlFor="forgot-email" error={error}>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              invalid={Boolean(error)}
              disabled={busy}
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {!busy && <Mail className="w-4 h-4" aria-hidden="true" />}
            {busy ? 'Sending' : 'Send reset link'}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            This form cannot tell you whether an address has an account: the reply is the
            same either way, so it is useless for building a list of who signs in here.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
