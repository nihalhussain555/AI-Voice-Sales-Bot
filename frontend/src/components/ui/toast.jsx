import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const ToastCtx = createContext({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  error: <AlertTriangle className="w-4 h-4 text-rose-400" />,
  info: <Info className="w-4 h-4 text-indigo-400" />
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info', ttl = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'animate-fadeIn flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs shadow-xl backdrop-blur-md',
              t.type === 'error' ? 'bg-rose-950/70 border-rose-700/60 text-rose-100' :
              t.type === 'success' ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-100' :
              'bg-slate-900/90 border-slate-700 text-slate-100'
            )}
          >
            {ICONS[t.type]}
            <span className="leading-relaxed">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
