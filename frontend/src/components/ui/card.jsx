import React from 'react';
import { cn } from '../../lib/cn.js';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'bg-slate-900/70 border border-slate-800/80 rounded-2xl shadow-lg backdrop-blur-md',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('px-5 pt-5 pb-3 flex items-center justify-between', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-sm font-bold text-white tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-slate-400', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('px-5 py-4 border-t border-slate-800/60 flex items-center gap-2', className)} {...props} />;
}
