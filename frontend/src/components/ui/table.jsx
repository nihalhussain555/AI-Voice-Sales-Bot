import React from 'react';
import { cn } from '../../lib/cn.js';

export function Table({ className, containerClassName, ...props }) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-surface', containerClassName)}>
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ children, className }) {
  return (
    <thead className={cn('bg-surface-3/80 text-ink-muted text-[11px] uppercase tracking-wider', className)}>
      {children}
    </thead>
  );
}

export function Th({ children, className, align }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left font-bold whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align }) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-ink-soft border-t border-line/70 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className, ...props }) {
  return (
    <tr className={cn('hover:bg-surface-2/70 transition-colors duration-150', className)} {...props}>
      {children}
    </tr>
  );
}
