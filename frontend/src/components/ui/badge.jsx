import React from 'react';
import { cn } from '../../lib/cn.js';

// Variant names stay hue-flavoured because callers think in them, but each one
// resolves to a semantic token, so light mode gets a readable tint instead of a
// washed-out pastel.
const styles = {
  default: 'bg-surface-2 text-ink-soft border-line',
  indigo: 'bg-primary/15 text-primary border-primary/25',
  primary: 'bg-primary/15 text-primary border-primary/25',
  violet: 'bg-violet/15 text-violet border-violet/25',
  electric: 'bg-electric/15 text-electric border-electric/25',
  emerald: 'bg-success/15 text-success border-success/25',
  success: 'bg-success/15 text-success border-success/25',
  amber: 'bg-warn/15 text-warn border-warn/25',
  rose: 'bg-danger/15 text-danger border-danger/25',
  danger: 'bg-danger/15 text-danger border-danger/25',
  sky: 'bg-info/15 text-info border-info/25',
  slate: 'bg-ink-muted/10 text-ink-muted border-line'
};

const STATUS_COLORS = {
  'Converted': 'emerald',
  'Demo Requested': 'sky',
  'Interested': 'indigo',
  'Follow-up Required': 'amber',
  'Not Interested': 'rose',
  'No Response': 'slate',
  // lead pipeline
  'New': 'sky',
  'Contacted': 'indigo',
  'Qualified': 'amber',
  'Won': 'emerald',
  'Lost': 'rose'
};

export function Badge({ className, variant = 'default', dot, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
        styles[variant] || styles.default,
        className
      )}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }) {
  if (!status) return <span className="text-ink-muted text-xs">—</span>;
  return <Badge variant={STATUS_COLORS[status] || 'default'} className={className}>{status}</Badge>;
}

// Phone call attempt results (busy, no-answer, canceled, …) — a different
// vocabulary from the sales statuses above, so it gets its own mapping.
const OUTCOME_COLORS = {
  completed: 'emerald',
  active: 'emerald',
  ringing: 'amber',
  queued: 'indigo',
  busy: 'amber',
  'no-answer': 'amber',
  canceled: 'slate',
  rejected: 'rose',
  'not-callable': 'rose',
  failed: 'rose',
  unknown: 'slate'
};

export const OUTCOME_WORDS = {
  completed: 'Completed',
  busy: 'Busy',
  'no-answer': 'No answer',
  canceled: 'Canceled',
  rejected: 'Rejected',
  'not-callable': 'Not callable',
  failed: 'Failed',
  active: 'In progress',
  ringing: 'Ringing',
  queued: 'Queued'
};

export function OutcomeBadge({ outcome, label, className }) {
  if (!outcome) return null;
  return (
    <Badge variant={OUTCOME_COLORS[outcome] || 'default'} className={className} dot>
      {label || OUTCOME_WORDS[outcome] || String(outcome).replace(/-/g, ' ')}
    </Badge>
  );
}
