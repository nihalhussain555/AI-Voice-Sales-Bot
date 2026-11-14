import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';

import AuthLayout, { AuthSwitch, FormNote } from '../../components/auth/AuthLayout.jsx';
import PasswordField from '../../components/auth/PasswordField.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Field, Input } from '../../components/ui/input.jsx';
import { useAuth } from '../../context/auth.jsx';
import {
  validateEmail, validateName, validatePhone, validatePassword, firstError, fieldErrorsFrom
} from '../../lib/validation.js';

const BLANK = { fullName: '', email: '', phone: '', password: '', confirmPassword: '', acceptedTerms: false };

export default function RegisterPage() {
  const { register, policy } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const minLength = policy?.passwordMinLength ?? 8;
  const signupClosed = policy && policy.signupOpen === false;

  const set = (key) => (value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: null } : e));
  };

  const runValidation = () => ({
    fullName: validateName(form.fullName),
    email: validateEmail(form.email),
    phone: form.phone ? validatePhone(form.phone) : null,
    password: validatePassword(form.password, { minLength }),
    confirmPassword: !form.password
      ? null
      : form.confirmPassword
        ? (form.confirmPassword === form.password ? null : 'Both passwords must match')
        : 'Confirm your password',
    acceptedTerms: form.acceptedTerms ? null : 'Accept the terms and conditions to create an account'
  });

  const submit = async (event) => {
    event.preventDefault();
    if (busy || signupClosed) return;

    const next = runValidation();
    if (firstError(...Object.values(next))) {
      setErrors(next);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);

    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        acceptedTerms: true
      });
      navigate('/overview', { replace: true });
    } catch (err) {
      // The server re-checks every rule above; whatever it rejects is mapped back
      // onto the field it names, so the message appears under the right input.
      const mapped = fieldErrorsFrom(err);
      const { form: banner, ...fieldOnes } = mapped;
      setErrors(fieldOnes);
      setFormError(banner || null);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account per person. Calls, customers and agent configuration stay inside it."
      footer={<AuthSwitch prompt="Already have an account?" label="Sign in" to="/login" />}
    >
      {signupClosed ? (
        <div className="space-y-4">
          <FormNote>
            This VoicePitch AI instance has reached its account limit, so new registrations are closed.
            Sign in with an existing account, or ask your administrator to raise MAX_USERS.
          </FormNote>
          <AuthSwitch prompt="" label="Go to sign in" to="/login" />
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormNote>{formError}</FormNote>

          <Field label="Full name" htmlFor="reg-name" error={errors.fullName}>
            <Input
              id="reg-name"
              name="fullName"
              autoComplete="name"
              placeholder="Priya Raghavan"
              value={form.fullName}
              onChange={e => set('fullName')(e.target.value)}
              invalid={Boolean(errors.fullName)}
              disabled={busy}
            />
          </Field>

          <Field label="Email" htmlFor="reg-email" error={errors.email}>
            <Input
              id="reg-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={e => set('email')(e.target.value)}
              invalid={Boolean(errors.email)}
              disabled={busy}
            />
          </Field>

          <Field
            label="Phone (optional)"
            htmlFor="reg-phone"
            error={errors.phone}
            hint="Used for outbound call displays; +country code works best."
          >
            <Input
              id="reg-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={e => set('phone')(e.target.value)}
              invalid={Boolean(errors.phone)}
              disabled={busy}
            />
          </Field>

          <PasswordField
            label="Password"
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
            label="Confirm password"
            name="confirmPassword"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
            error={errors.confirmPassword}
            disabled={busy}
          />

          <label className="flex cursor-pointer items-start gap-2.5 select-none">
            <input
              type="checkbox"
              name="acceptedTerms"
              checked={form.acceptedTerms}
              onChange={e => set('acceptedTerms')(e.target.checked)}
              aria-invalid={errors.acceptedTerms || undefined}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface-3 accent-[rgb(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            <span className="text-[12px] leading-relaxed text-ink-muted">
              I accept the terms of service and privacy policy, and confirm I will only
              call parties who are lawfully contactable under my local regulations.
            </span>
          </label>
          {errors.acceptedTerms && (
            <p className="-mt-2 text-[11px] leading-relaxed text-danger">{errors.acceptedTerms}</p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {!busy && <UserPlus className="w-4 h-4" aria-hidden="true" />}
            {busy ? 'Creating account' : 'Create account'}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            Your password is salted and bcrypt-hashed before it is written to disk, and
            never returned to the browser or printed in a log.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
