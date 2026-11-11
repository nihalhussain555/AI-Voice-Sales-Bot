import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const cardVariants = cva(
  'rounded-card border transition-shadow duration-200',
  {
    variants: {
      variant: {
        default: 'bg-surface border-line shadow-soft edge-light',
        // Only for the few hero panels — overuse makes a dashboard read noisy.
        glass: 'glass border-line/70 shadow-lifted',
        flat: 'bg-surface border-line',
        inset: 'bg-surface-3/60 border-line/70',
        interactive: 'bg-surface border-line hover:border-line-strong hover:shadow-lifted cursor-pointer'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export function Card({ className, variant, ...props }) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('px-5 pt-5 pb-3 flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-sm font-bold text-ink tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-ink-muted mt-0.5 leading-relaxed', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('px-5 py-4 border-t border-line/70 flex items-center gap-2', className)} {...props} />;
}
