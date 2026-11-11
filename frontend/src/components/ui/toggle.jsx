import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export function Toggle({ checked, onChange, label, description, disabled, className, id }) {
  const control = (
    <span
      className={cn(
        'relative inline-flex h-5 w-9 rounded-full border transition-colors duration-200 shrink-0',
        checked ? 'bg-primary border-primary' : 'bg-surface-3 border-line-strong',
        disabled && 'opacity-50'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-primary-ink shadow-soft transition-transform duration-200 ease-spring',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </span>
  );

  if (!label) {
    return (
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-full', className)}
      >
        {control}
      </button>
    );
  }

  return (
    <label
      htmlFor={id}
      className={cn('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-60 cursor-not-allowed', className)}
    >
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="inline-flex mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-full"
      >
        {control}
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, description, className, id, disabled }) {
  return (
    <label
      htmlFor={id}
      className={cn('flex items-start gap-2.5 cursor-pointer select-none', disabled && 'opacity-60 cursor-not-allowed', className)}
    >
      <button
        type="button"
        id={id}
        role="checkbox"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          checked ? 'bg-primary border-primary text-primary-ink' : 'bg-surface-3 border-line-strong hover:border-primary/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
        )}
      >
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">{label}</span>
        {description && <span className="block text-[11px] text-ink-muted mt-0.5 leading-relaxed">{description}</span>}
      </span>
    </label>
  );
}
