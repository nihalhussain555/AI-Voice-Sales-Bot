import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Field, Input } from '../ui/input.jsx';
import { passwordStrength } from '../../lib/validation.js';

// Password input with a visibility toggle. The button is type="button" so
// toggling mid-form never submits it, and it is aria-labelled because an icon
// alone tells a screen-reader user nothing about what just changed.
export default function PasswordField({
  label = 'Password', value, onChange, error, hint, autoComplete = 'current-password',
  showStrength = false, name, disabled, onBlur
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const strength = showStrength && value ? passwordStrength(value) : null;

  return (
    <div className="min-w-0">
      <Field label={label} htmlFor={id} error={error} hint={hint}>
        <div className="relative">
          <Input
            id={id}
            name={name}
            type={visible ? 'text' : 'password'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            autoComplete={autoComplete}
            disabled={disabled}
            aria-invalid={error || undefined}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 rounded-field p-2 transition-colors',
              'text-ink-muted hover:text-ink hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              'disabled:opacity-40'
            )}
            disabled={disabled}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>

      {strength && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-1 flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4, 5].map(step => (
              <span
                key={step}
                className={cn(
                  'h-full flex-1 rounded-full transition-colors',
                  step <= strength.score
                    ? strength.score <= 2 ? 'bg-danger' : strength.score <= 3 ? 'bg-warn' : 'bg-success'
                    : 'bg-line'
                )}
              />
            ))}
          </div>
          <span className="w-16 text-right text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            {strength.label}
          </span>
        </div>
      )}
    </div>
  );
}
