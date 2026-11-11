import React from 'react';
import { cn } from '../../lib/cn.js';

// Segmented control. `items` = [{ value, label, icon?, count? }].
export default function Tabs({ items, value, onChange, size = 'md', className, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-1 bg-surface-3/80 border border-line rounded-xl p-1', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={String(item.value)}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-bold transition-all duration-150 whitespace-nowrap',
              size === 'xs' ? 'text-[11px] px-2 py-1' : size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-xs px-3.5 py-2',
              active
                ? 'bg-primary text-primary-ink shadow-soft'
                : 'text-ink-muted hover:text-ink hover:bg-surface-2'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {item.label}
            {typeof item.count === 'number' && (
              <span className={cn('font-mono tabular-nums text-[10px] px-1.5 rounded-full',
                active ? 'bg-primary-ink/25' : 'bg-surface-2 text-ink-muted')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
