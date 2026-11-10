import React from 'react';
import { cn } from '../../lib/cn.js';

export const inputClass =
  'w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition';

export function Input({ className, ...props }) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(inputClass, 'min-h-[80px] resize-y', className)} {...props} />;
}

export function Label({ className, ...props }) {
  return <label className={cn('block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(inputClass, 'appearance-none cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}
