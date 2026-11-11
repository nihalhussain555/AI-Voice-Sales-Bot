import React from 'react';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-field font-semibold whitespace-nowrap ' +
  'transition-all duration-150 ease-spring select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:opacity-45 disabled:pointer-events-none active:scale-[0.985]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-ink hover:bg-primary-hover shadow-soft hover:shadow-lifted',
        secondary: 'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
        outline: 'border border-line-strong text-ink-soft hover:text-ink hover:bg-surface-2',
        ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
        danger: 'bg-danger text-primary-ink hover:opacity-90 shadow-soft',
        success: 'bg-success text-primary-ink hover:opacity-90 shadow-soft',
        // Low-emphasis action that still reads as part of the brand.
        soft: 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25'
      },
      size: {
        xs: 'text-[11px] px-2.5 py-1 gap-1.5',
        sm: 'text-xs px-3 py-1.5',
        md: 'text-sm px-4 py-2',
        lg: 'text-sm px-6 py-3',
        icon: 'p-2',
        'icon-sm': 'p-1.5'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

export const Button = React.forwardRef(({ className, variant, size, loading, disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  >
    {loading && <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />}
    {children}
  </button>
));
Button.displayName = 'Button';

// Text-shaped action for inline affordances ("View all", "Retry").
export const LinkButton = ({ className, children, ...props }) => (
  <button
    type="button"
    className={cn(
      'inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover ' +
      'underline-offset-4 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded',
      className
    )}
    {...props}
  >
    {children}
  </button>
);
