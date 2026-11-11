import React from 'react';
import { cn } from '../../lib/cn.js';

const BAR_TINTS = {
  primary: 'bg-primary',
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
  electric: 'bg-electric'
};

export function ProgressBar({ value = 0, max = 100, tone = 'primary', indeterminate, size = 'md', label, className }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted truncate">{label}</span>
          {!indeterminate && <span className="text-[11px] font-mono text-ink-soft tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn('w-full bg-surface-3 rounded-full overflow-hidden',
          size === 'sm' ? 'h-1' : size === 'lg' ? 'h-3' : 'h-1.5')}
      >
        {indeterminate ? (
          <div className={cn('h-full w-1/3 rounded-full animate-indeterminate', BAR_TINTS[tone])} />
        ) : (
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-spring', BAR_TINTS[tone])}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// Horizontal ranked list used for "by product", "by outcome" style panels.
export function MeterRow({ name, value, detail, max = 1, tone = 'primary', className }) {
  const pct = Math.max(2, Math.round((value / (max || 1)) * 100));
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3 text-[11px] mb-1">
        <span className="font-semibold text-ink-soft truncate">{name}</span>
        {detail && <span className="font-mono text-ink-muted shrink-0 tabular-nums">{detail}</span>}
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500 ease-spring', BAR_TINTS[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
