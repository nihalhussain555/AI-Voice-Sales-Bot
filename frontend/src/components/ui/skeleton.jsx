import React from 'react';
import { cn } from '../../lib/cn.js';

export function Skeleton({ className, rounded = true }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-2 animate-shimmer',
        rounded && 'rounded-field',
        className
      )}
    />
  );
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

// Matches the real Table markup widths so the skeleton does not jump when data
// lands.
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="rounded-card border border-line bg-surface overflow-hidden" aria-busy="true">
      <div className="px-4 py-3 bg-surface-3/80 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex gap-4 border-t border-line/70">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5 flex-1', c === cols - 1 && 'flex-initial w-16')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface p-5 space-y-3', className)} aria-busy="true">
      <Skeleton className="h-8 w-8" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
