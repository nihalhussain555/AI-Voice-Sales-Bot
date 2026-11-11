import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { pageTitle } from '../../lib/nav.js';
import { useTheme } from '../../context/theme.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-field border transition-colors',
        'border-line bg-surface-2/60 text-ink-muted hover:text-ink hover:bg-surface-2 hover:border-line-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
      )}
    >
      {isLight ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}

export default function Topbar({ products, notifications, unread, onMarkAllRead, profile, product, onOpenMobileNav }) {
  const { pathname } = useLocation();
  const title = pageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-line bg-surface-2/60 text-ink-muted transition-colors hover:text-ink hover:bg-surface-2 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-tight text-ink sm:text-base">
          {title}
        </h1>

        <GlobalSearch products={products} className="w-32 shrink-0 sm:w-56 lg:w-80" />
        <NotificationsBell items={notifications} unread={unread} onMarkAll={onMarkAllRead} />
        <ThemeToggle />
        <ProfileMenu profile={profile} product={product} />
      </div>
    </header>
  );
}
