import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './button.jsx';
import { SkeletonTable, SkeletonCard, SkeletonText } from './skeleton.jsx';

export function EmptyState({ icon: Icon, title, message, action, className, compact }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-card border border-dashed border-line-strong/70',
        compact ? 'py-8 px-4' : 'py-14 px-6',
        className
      )}
    >
      {Icon && (
        <span className="w-11 h-11 rounded-full bg-surface-2 border border-line flex items-center justify-center text-ink-muted mb-3.5">
          <Icon className="w-5 h-5" />
        </span>
      )}
      <p className="text-sm font-bold text-ink">{title}</p>
      {message && <p className="text-xs text-ink-muted mt-1.5 max-w-sm leading-relaxed">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Could not load this view', message, onRetry, className }) {
  return (
    <div className={cn('rounded-card border border-danger/35 bg-danger/10 p-5 flex items-start gap-3', className)}>
      <span className="w-9 h-9 rounded-full bg-danger/15 text-danger flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{title}</p>
        {message && <p className="text-xs text-ink-soft mt-1 leading-relaxed break-words">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

const SKELETONS = { table: SkeletonTable, card: SkeletonCard, text: SkeletonText };

// One place that decides loading / error / empty / ready, so no page invents
// its own spinner markup.
export function LoadState({
  isLoading, error, isEmpty, onRetry,
  skeleton = 'table', skeletonClassName,
  emptyIcon, emptyTitle, emptyMessage, emptyAction,
  className, children
}) {
  if (error) {
    return <ErrorState message={error.message || String(error)} onRetry={onRetry} className={className} />;
  }
  if (isLoading) {
    const Sk = SKELETONS[skeleton] || SkeletonTable;
    return <Sk className={skeletonClassName} />;
  }
  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        message={emptyMessage}
        action={emptyAction}
        className={className}
      />
    );
  }
  return children;
}
