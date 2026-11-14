import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { api } from '../services/api.js';
import { cn } from '../lib/cn.js';
import { buildNotifications, markRead, readIds, NOTIFICATIONS_EVENT } from '../lib/notifications.js';
import { getSidebarCollapsed, setSidebarCollapsed, SIDEBAR_EVENT } from '../lib/profile.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import ProductPicker from './ProductPicker.jsx';
import Sidebar, { NavList } from './shell/Sidebar.jsx';
import Topbar from './shell/Topbar.jsx';
import { BrandMark, BrandWordmark } from './ui/brand.jsx';

export function useApp() {
  return useOutletContext();
}

export default function AppShell() {
  const location = useLocation();
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seen, setSeen] = useState(readIds);

  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30000 });
  const { data: productsData } = useQuery({ queryKey: ['products'], queryFn: api.products });
  // Same cache keys the pages use — the bell and the global search read the
  // records the app already loads instead of hitting the API again.
  const { data: callsData } = useQuery({ queryKey: ['calls'], queryFn: api.calls, refetchInterval: 60000 });
  const { data: leadsData } = useQuery({ queryKey: ['leads'], queryFn: api.leads });

  const products = productsData?.products || [];
  const allProducts = [...workspace.customProducts, ...products];
  const product = allProducts.find(p => p.id === workspace.productKey) || allProducts[0] || null;

  const notifications = useMemo(
    () => buildNotifications({ calls: callsData?.calls || [], leads: leadsData?.leads || [] }),
    [callsData, leadsData]
  );
  const unread = notifications.filter(item => !seen.has(item.id)).length;

  const toggleCollapsed = () => setSidebarCollapsed(!collapsed);

  const markAllRead = () => markRead(notifications.map(item => item.id));

  useEffect(() => {
    const sync = () => setSeen(readIds());
    window.addEventListener(NOTIFICATIONS_EVENT, sync);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, sync);
  }, []);

  useEffect(() => {
    const onSidebar = (event) => setCollapsed(event.detail);
    window.addEventListener(SIDEBAR_EVENT, onSidebar);
    return () => window.removeEventListener(SIDEBAR_EVENT, onSidebar);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The drawer is a modal dialog, so it dismisses on Escape like every other
    // overlay in this console.
    const onKey = (event) => { if (event.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const outletContext = {
    product,
    products: allProducts,
    selectProduct: workspace.selectProduct,    workspace,
    openProductPicker: () => setPickerOpen(true),
    health
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        health={health}
        product={product}
        onOpenProduct={() => setPickerOpen(true)}
      />

      {/* Mobile drawer — the desktop rail is hidden here, so the list still only
          renders in one place at a time. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[rgb(var(--scrim))]" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col border-r border-line bg-surface shadow-lifted animate-slide-in">
            <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2.5">
                  <BrandMark labelled={false} />
                  <BrandWordmark />
                </div>
                <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted">Autonomous sales AE</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-field p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
            <div className="shrink-0 border-t border-line px-3 py-3">
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); setPickerOpen(true); }}
                className="flex w-full items-center gap-2.5 rounded-field border border-line bg-surface-2/60 px-3 py-2 text-left transition-colors hover:border-line-strong"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">Pitching</span>
                <span className="truncate text-[11px] font-semibold text-ink">{product?.name || 'Select product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200 ease-spring', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Topbar
          products={allProducts}
          product={product}
          notifications={notifications}
          unread={unread}
          onMarkAllRead={markAllRead}
          onOpenMobileNav={() => setDrawerOpen(true)}
        />

        <main className="flex-1">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet context={outletContext} />
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
            <span className="font-semibold">VoicePitch AI</span>
            <span aria-hidden="true">·</span>
            <span>v{health?.version || '2.1.0'}</span>
            <span aria-hidden="true">·</span>
            <NavLink to="/help" className="font-semibold text-primary-hover hover:underline">Help &amp; support</NavLink>
            <span className="ml-auto">{health ? 'Backend reachable' : 'Waiting for backend'}</span>
          </div>
        </footer>
      </div>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        products={allProducts}
        active={product}
        onSelect={workspace.selectProduct}
      />
    </div>
  );
}
