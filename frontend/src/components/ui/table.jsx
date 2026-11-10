import React from 'react';
import { cn } from '../../lib/cn.js';

export function Table({ className, ...props }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
      {children}
    </thead>
  );
}

export function Th({ children, className }) {
  return <th className={cn('px-4 py-3 text-left font-bold', className)}>{children}</th>;
}

export function Td({ children, className }) {
  return <td className={cn('px-4 py-3 text-slate-300 border-t border-slate-800/60', className)}>{children}</td>;
}

export function Tr({ children, className, ...props }) {
  return <tr className={cn('hover:bg-slate-800/30 transition-colors', className)} {...props}>{children}</tr>;
}
