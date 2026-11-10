import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Phone, PhoneCall, History, BarChart3, Users, Settings, Layers, KeyRound
} from 'lucide-react';
import { api } from '../services/api.js';
import { cn } from '../lib/cn.js';
import { Badge } from '../components/ui/badge.jsx';
import ProductPicker from '../components/ProductPicker.jsx';

const NAV = [
  { to: '/call', label: 'Demo Call', icon: Phone },
  { to: '/phone', label: 'Phone Call', icon: PhoneCall },
  { to: '/history', label: 'Call History', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/leads', label: 'Leads CRM', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function useApp() {
  return useOutletContext();
}

export default function AppShell() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productKey, setProductKey] = useState(() => localStorage.getItem('vp_product') || 'devpulse');

  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30000 });
  const { data: productsData } = useQuery({ queryKey: ['products'], queryFn: api.products });

  const products = productsData?.products || [];
  const storedCustom = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('vp_custom_products') || '[]'); } catch { return []; }
  }, [pickerOpen]);
  const allProducts = [...storedCustom, ...products];
  const product = allProducts.find(p => p.id === productKey) || allProducts[0] || null;

  const selectProduct = (p) => {
    setProductKey(p.id);
    localStorage.setItem('vp_product', p.id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex selection:bg-indigo-500 selection:text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-60 hidden lg:flex flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-md z-40">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-800/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">VoicePitch AI</div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Autonomous Sales AE</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors',
                isActive ? 'bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800/60 space-y-2">
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-900 transition text-left"
          >
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-300 truncate">{product?.name || 'Select product'}</span>
          </button>
          <div className="flex items-center gap-2 px-1">
            <KeyRound className={cn('w-3.5 h-3.5', health?.groqKeyConfigured ? 'text-emerald-400' : 'text-amber-400')} />
            <span className="text-[10px] text-slate-500 font-medium">
              {health == null ? 'Server offline' : health.groqKeyConfigured ? 'Groq connected' : 'Demo engine mode'}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60">
        <div className="flex items-center gap-2 px-3 h-14 overflow-x-auto no-scrollbar">
          <Bot className="w-5 h-5 text-indigo-400 shrink-0" />
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition',
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 lg:ml-60 pt-16 lg:pt-0 min-h-screen">
        <Outlet context={{ product, selectProduct, openProductPicker: () => setPickerOpen(true), health }} />
      </main>

      <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} products={allProducts} active={product} onSelect={selectProduct} />
    </div>
  );
}
