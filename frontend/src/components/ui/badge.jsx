import React from 'react';
import { cn } from '../../lib/cn.js';

const styles = {
  default: 'bg-slate-800 text-slate-300 border-slate-700',
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  slate: 'bg-slate-700/40 text-slate-300 border-slate-600/50'
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

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
        styles[variant] || styles.default,
        className
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status, className }) {
  return <Badge variant={STATUS_COLORS[status] || 'default'} className={className}>{status}</Badge>;
}
