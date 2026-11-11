import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, BellOff } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import useDismiss from '../../hooks/useDismiss.js';

const TONE_DOT = {
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info'
};

export default function NotificationsBell({ items = [], unread = 0, onMarkAll }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useDismiss({ open, onClose: () => setOpen(false) });

  const openItem = (item) => {
    setOpen(false);
    navigate(item.to);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-field border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          open
            ? 'border-line-strong bg-surface-3 text-ink'
            : 'border-line bg-surface-2/60 text-ink-muted hover:text-ink hover:bg-surface-2'
        )}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white shadow-soft">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,22rem)] overflow-hidden rounded-card border border-line bg-surface shadow-lifted animate-scale-in">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Recent activity</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-6">
              <BellOff className="w-4 h-4 text-ink-muted shrink-0" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Nothing to report. Alerts appear here when a call is not reached, a call fails,
                a deal closes or a hot lead is waiting for follow-up.
              </p>
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[item.tone] || 'bg-info')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-ink-muted">{item.atLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
