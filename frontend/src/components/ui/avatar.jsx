import React from 'react';
import { cn } from '../../lib/cn.js';

const PALETTE = [
  'bg-primary/20 text-primary',
  'bg-violet/20 text-violet',
  'bg-electric/20 text-electric',
  'bg-success/20 text-success',
  'bg-warn/20 text-warn',
  'bg-danger/20 text-danger'
];

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm'
};

function initials(name = '') {
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic tint: the same customer keeps the same colour across pages,
// and no image request is made for a profile photo the backend cannot serve.
function tintFor(seed) {
  let hash = 0;
  for (const ch of String(seed || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({ name, size = 'md', className, ring }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold shrink-0 select-none',
        SIZES[size], tintFor(name),
        ring && 'ring-2 ring-surface',
        className
      )}
      title={name || undefined}
      aria-label={name ? `${name} avatar` : undefined}
    >
      {initials(name)}
    </span>
  );
}
