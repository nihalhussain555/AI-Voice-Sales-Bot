import React from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, PanelLeftClose, PanelLeftOpen, KeyRound, PhoneCall } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { NAV_GROUPS } from '../../lib/nav.js';
import { BrandMark, BrandWordmark } from '../ui/brand.jsx';
import Tooltip from '../ui/tooltip.jsx';

function NavItem({ to, label, icon: Icon, collapsed, onNavigate }) {
  return (
    <li>
      <Tooltip label={label} hidden={!collapsed} className="w-full">
        <NavLink
          to={to}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            'group/nav relative flex items-center rounded-field text-[13px] font-semibold transition-all duration-150 ease-spring',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            collapsed ? 'h-10 w-full justify-center' : 'gap-3 px-3 py-2.5',
            isActive
              ? 'bg-primary/15 text-ink shadow-inset'
              : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
          )}
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
              <Icon
                className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-primary' : 'text-ink-muted group-hover/nav:text-ink')}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </>
          )}
        </NavLink>
      </Tooltip>
    </li>
  );
}

// Used by both the desktop rail and the mobile drawer so the option list can
// only ever exist in one place at a time.
export function NavList({ collapsed = false, onNavigate, className }) {
  return (
    <nav className={cn('flex-1 overflow-y-auto no-scrollbar px-3 py-4', className)} aria-label="Primary">
      <div className="space-y-5">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.title}>
            {collapsed
              ? groupIndex > 0 && <div className="mx-3 mb-3 h-px bg-line" />
              : (
                <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                  {group.title}
                </p>
              )}
            <ul className="space-y-1">
              {group.items.map(item => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function EngineStatus({ health, collapsed }) {
  const offline = health == null;
  const dot = offline ? 'bg-warn' : health.groqKeyConfigured ? 'bg-success' : 'bg-info';
  const text = offline ? 'Connecting to backend' : health.groqKeyConfigured ? 'Groq engine live' : 'Rule-based fallback';
  const line = offline ? null : health.twilioConfigured ? 'Phone line connected' : 'Browser voice only';

  return (
    <div className={cn('space-y-1.5', collapsed && 'text-center')}>
      <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
        {!collapsed && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-muted truncate">
            <KeyRound className="w-3 h-3 shrink-0" />
            {text}
          </span>
        )}
      </div>
      {line && !collapsed && (
        <div className="flex items-center gap-2 pl-3.5">
          <PhoneCall className="w-3 h-3 text-ink-muted shrink-0" />
          <span className="text-[10px] font-medium text-ink-muted truncate">{line}</span>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse, health, product, onOpenProduct }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col border-r border-line',
        'bg-surface/70 backdrop-blur-xl transition-[width] duration-200 ease-spring',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      <div className={cn('flex items-center h-16 border-b border-line shrink-0', collapsed ? 'justify-center px-2' : 'gap-2.5 px-4')}>
        {collapsed ? <BrandMark /> : (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark labelled={false} />
              <BrandWordmark />
            </div>
            <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted">Autonomous sales AE</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'shrink-0 rounded-field p-1.5 text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            collapsed && 'absolute -right-3 top-[52px] bg-surface-2 border border-line shadow-soft'
          )}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <NavList collapsed={collapsed} />

      <div className={cn('border-t border-line shrink-0 space-y-3', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
        <Tooltip label={product?.name || 'Select product'} hidden={!collapsed} className="w-full">
          <button
            type="button"
            onClick={onOpenProduct}
            className={cn(
              'w-full flex items-center rounded-field border border-line bg-surface-2/60 hover:border-line-strong hover:bg-surface-3 transition-all',
              'text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              collapsed ? 'h-10 justify-center' : 'gap-2.5 px-3 py-2'
            )}
            aria-label={product?.name ? `Pitching ${product.name}. Change product` : 'Select a product'}
          >
            <Layers className="w-4 h-4 text-primary shrink-0" />
            {!collapsed && <span className="text-[11px] font-semibold text-ink-soft truncate">{product?.name || 'Select product'}</span>}
          </button>
        </Tooltip>
        <EngineStatus health={health} collapsed={collapsed} />
      </div>
    </aside>
  );
}
