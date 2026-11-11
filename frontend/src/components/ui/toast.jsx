import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const ToastCtx = createContext({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS = {
  success: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
  error: <AlertTriangle className="w-4 h-4 text-danger shrink-0" />,
  info: <Info className="w-4 h-4 text-primary shrink-0" />
};

const TONES = {
  success: 'bg-surface border-success/40 shadow-lifted',
  error: 'bg-surface border-danger/45 shadow-lifted',
  info: 'bg-surface border-line-strong shadow-lifted'
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, type = 'info', ttl = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    if (ttl) setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-slide-up flex items-start gap-2.5 rounded-card border px-4 py-3 text-xs text-ink shadow-lifted',
              TONES[t.type] || TONES.info
            )}
          >
            {ICONS[t.type] || ICONS.info}
            <span className="leading-relaxed flex-1 min-w-0 break-words">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-ink-muted hover:text-ink transition-colors shrink-0 -mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
