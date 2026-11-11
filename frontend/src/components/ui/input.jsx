import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export const inputClass =
  'w-full bg-surface-3/70 border border-line rounded-field px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-ink-muted/70 transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-focus/45 focus:border-primary/70 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export function Input({ className, invalid, ...props }) {
  return <input aria-invalid={invalid || undefined} className={cn(inputClass, invalid && 'border-danger/70 focus:ring-danger/40', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(inputClass, 'min-h-[88px] resize-y leading-relaxed', className)} {...props} />;
}

export function Label({ className, ...props }) {
  return <label className={cn('block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'appearance-none cursor-pointer pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

// Label + control + validation/hint copy in one wrapper, so every form on every
// page spaces itself the same way.
export function Field({ label, hint, error, className, children, htmlFor }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-[11px] text-danger mt-1.5 leading-relaxed">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

export function HintText({ className, children }) {
  return <p className={cn('text-[11px] text-ink-muted leading-relaxed', className)}>{children}</p>;
}
