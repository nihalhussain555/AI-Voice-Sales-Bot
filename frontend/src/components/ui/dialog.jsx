import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export default function Dialog({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl animate-fadeIn max-h-[85vh] flex flex-col',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
