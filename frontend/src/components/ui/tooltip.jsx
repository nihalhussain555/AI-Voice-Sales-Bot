import React from 'react';
import { cn } from '../../lib/cn.js';

const PLACEMENT = {
  right: 'left-full top-1/2 -translate-y-1/2 ml-3',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-3'
};

// CSS-only: no portal, no timer, and it appears on keyboard focus too, which is
// what makes collapsed-sidebar icon buttons usable.
export default function Tooltip({ label, children, placement = 'right', className, hidden }) {
  if (!label || hidden) return children;
  return (
    <span className={cn('relative inline-flex group/tip', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-field px-2.5 py-1.5',
          'bg-surface-3 border border-line-strong text-[11px] font-semibold text-ink shadow-lifted',
          'opacity-0 translate-x-0.5 transition-all duration-150 ease-spring',
          'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0',
          PLACEMENT[placement] || PLACEMENT.right
        )}
      >
        {label}
      </span>
    </span>
  );
}
