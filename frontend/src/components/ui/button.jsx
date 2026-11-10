import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/25',
        secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700',
        outline: 'border border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white',
        ghost: 'text-slate-400 hover:text-white hover:bg-slate-800/60',
        danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-600/25',
        success: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/25'
      },
      size: {
        sm: 'text-xs px-3 py-1.5',
        md: 'text-sm px-4 py-2',
        lg: 'text-sm px-6 py-3',
        icon: 'p-2'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

export const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
