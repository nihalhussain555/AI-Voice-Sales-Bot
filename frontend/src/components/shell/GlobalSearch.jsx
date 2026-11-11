import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, PhoneCall, Users, Layers, CornerDownLeft } from 'lucide-react';
import { api } from '../../services/api.js';
import { cn } from '../../lib/cn.js';
import useDismiss from '../../hooks/useDismiss.js';

const MIN_TERMS = 2;
const PER_GROUP = 5;

const matches = (term, ...values) =>
  values.some(value => String(value || '').toLowerCase().includes(term));

export default function GlobalSearch({ products = [], className }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const panelRef = useDismiss({ open, onClose: () => setOpen(false) });

  const query = term.trim().toLowerCase();
  const active = query.length >= MIN_TERMS;

  // Same cache keys the pages use, so searching does not double-fetch.
  const { data: callsData } = useQuery({
    queryKey: ['calls'],
    queryFn: api.calls,
    enabled: active
  });
  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: api.leads,
    enabled: active
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const groups = useMemo(() => {
    if (!active) return [];
    const out = [];

    const calls = (callsData?.calls || [])
      .filter(call => matches(query, call.customerName, call.company, call.product, call.status))
      .slice(0, PER_GROUP)
      .map(call => ({
        key: `call-${call.id}`,
        icon: PhoneCall,
        title: call.customerName || 'Unknown prospect',
        subtitle: [call.product, call.status, new Date(call.timestamp || Date.now()).toLocaleDateString()].filter(Boolean).join(' · '),
        to: `/history?call=${call.id}`
      }));
    if (calls.length) out.push({ label: 'Calls', items: calls });

    const leads = (leadsData?.leads || [])
      .filter(lead => matches(query, lead.name, lead.company, lead.email, lead.phone, lead.product))
      .slice(0, PER_GROUP)
      .map(lead => ({
        key: `lead-${lead.id}`,
        icon: Users,
        title: lead.name,
        subtitle: [lead.company, lead.phone || lead.email, lead.pipelineStatus].filter(Boolean).join(' · '),
        to: `/customers?lead=${lead.id}`
      }));
    if (leads.length) out.push({ label: 'Customers', items: leads });

    const prods = products
      .filter(product => matches(query, product.name, product.tagline, product.category))
      .slice(0, PER_GROUP)
      .map(product => ({
        key: `product-${product.id}`,
        icon: Layers,
        title: product.name,
        subtitle: product.tagline || product.category || 'Product in the pitch catalog',
        to: `/agent?product=${product.id}`
      }));
    if (prods.length) out.push({ label: 'Products', items: prods });

    return out;
  }, [active, callsData, leadsData, products, query]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const first = groups[0]?.items[0];

  const goTo = (item) => {
    if (!item) return;
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
    navigate(item.to);
  };

  return (
    <div ref={panelRef} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && active}
        aria-controls="global-search-results"
        aria-label="Search calls, customers and products"
        value={term}
        placeholder="Search calls, customers…"
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') goTo(first);
        }}
        className={cn(
          'w-full rounded-field border border-line bg-surface-2/60 pl-9 pr-12 h-9',
          'text-[13px] text-ink placeholder:text-ink-muted outline-none transition-all',
          'focus:border-primary/40 focus:bg-surface-2 focus:ring-2 focus:ring-focus/25',
          '[&::-webkit-search-cancel-button]:hidden'
        )}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-bold text-ink-muted lg:block">
        CTRL K
      </kbd>

      {open && active && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,26rem)] overflow-hidden rounded-card border border-line bg-surface shadow-lifted animate-scale-in"
        >
          {total === 0 ? (
            <p className="px-4 py-5 text-xs text-ink-muted">
              No calls, customers or products match “{term.trim()}”.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto py-1.5">
              {groups.map(group => (
                <div key={group.label} className="py-1">
                  <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                    {group.label}
                  </p>
                  {group.items.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={item === first}
                      onClick={() => goTo(item)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <item.icon className="w-4 h-4 shrink-0 text-ink-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
                        <span className="block truncate text-[11px] text-ink-muted">{item.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-[10px] font-medium text-ink-muted">
            <span>Enter opens the first result</span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> Esc to dismiss
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
