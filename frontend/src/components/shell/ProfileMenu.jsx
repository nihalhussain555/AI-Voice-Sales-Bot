import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, UserRound, MonitorSmartphone } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import useDismiss from '../../hooks/useDismiss.js';
import Avatar from '../ui/avatar.jsx';

// No sign-in exists in this build, so the menu is explicit about where the
// profile lives instead of imitating an account system.
export default function ProfileMenu({ profile, product }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useDismiss({ open, onClose: () => setOpen(false), returnFocus: true });

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex h-9 items-center gap-2 rounded-field border px-1.5 transition-colors sm:pr-2.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          open
            ? 'border-line-strong bg-surface-3'
            : 'border-line bg-surface-2/60 hover:bg-surface-2 hover:border-line-strong'
        )}
      >
        <Avatar name={profile.name} size="xs" />
        <span className="hidden max-w-[9rem] truncate text-[12px] font-semibold text-ink sm:block">
          {profile.name}
        </span>
        <ChevronDown className={cn('hidden w-3.5 h-3.5 text-ink-muted transition-transform sm:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,19rem)] overflow-hidden rounded-card border border-line bg-surface shadow-lifted animate-scale-in"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
            <Avatar name={profile.name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-ink">{profile.name}</p>
              <p className="truncate text-[11px] text-ink-muted">{profile.role} · this browser only</p>
            </div>
          </div>

          <dl className="divide-y divide-line text-[11px]">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="flex items-center gap-2 text-ink-muted"><MonitorSmartphone className="w-3.5 h-3.5" /> Pitching</dt>
              <dd className="truncate font-semibold text-ink-soft">{product?.name || 'No product selected'}</dd>
            </div>
          </dl>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/profile')}
              className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <UserRound className="w-4 h-4 text-ink-muted" />
              Profile &amp; settings
            </button>
          </div>

          <p className="border-t border-line bg-surface-2/50 px-4 py-2.5 text-[10px] leading-relaxed text-ink-muted">
            VoicePitch AI runs without a login in this build. Your name, theme and product choice
            are stored locally on this device.
          </p>
        </div>
      )}
    </div>
  );
}
