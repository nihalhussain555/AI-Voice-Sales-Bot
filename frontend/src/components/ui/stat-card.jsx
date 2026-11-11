import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Skeleton } from './skeleton.jsx';

export const TINTS = {
  primary: 'bg-primary/15 text-primary',
  violet: 'bg-violet/15 text-violet',
  electric: 'bg-electric/15 text-electric',
  success: 'bg-success/15 text-success',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  muted: 'bg-surface-2 text-ink-muted'
};

export function StatCard({
  icon: Icon, label, value, hint, tint = 'primary',
  trend, trendLabel, loading, className, onClick, footer
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={cn(
        'rounded-card border border-line bg-surface p-4 sm:p-5 shadow-soft edge-light',
        'transition-all duration-200 ease-spring min-w-0',
        interactive && 'cursor-pointer hover:border-line-strong hover:shadow-lifted hover:-translate-y-0.5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', TINTS[tint])}>
          {Icon && <Icon className="w-4 h-4" />}
        </span>
        {typeof trend === 'number' && trend !== 0 && (
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold',
            trend > 0 ? 'text-success' : 'text-danger')}>
            {trend > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="mt-3.5 min-w-0">
        {loading ? (
          <>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-28 mt-2" />
          </>
        ) : (
          <>
            <div className="text-2xl font-extrabold text-ink leading-none tabular-nums truncate">
              {value ?? '—'}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mt-2 truncate">
              {label}
            </div>
            {(hint || trendLabel) && (
              <div className="text-[11px] text-ink-muted/90 mt-1 leading-relaxed truncate">{hint || trendLabel}</div>
            )}
          </>
        )}
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-line/70">{footer}</div>}
    </div>
  );
}
