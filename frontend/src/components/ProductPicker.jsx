import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import Dialog from './ui/dialog.jsx';
import { Button } from './ui/button.jsx';
import { Field, Input, Textarea } from './ui/input.jsx';
import { cn } from '../lib/cn.js';
import { getCustomProducts, saveCustomProducts } from '../lib/profile.js';

export default function ProductPicker({ open, onClose, products, active, onSelect }) {
  const [mode, setMode] = useState('list'); // list | custom
  const [form, setForm] = useState({ name: '', tagline: '', pitch: '', pricing: '', features: '', targetCustomer: '' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const saveCustom = () => {
    if (!form.name.trim() || !form.pitch.trim()) return;
    const prod = {
      id: `custom-${Date.now()}`,
      name: form.name.trim(),
      tagline: form.tagline.trim() || 'Custom SaaS Product',
      pitch: form.pitch.trim(),
      pricing: form.pricing.trim() || 'Custom pricing',
      features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      targetCustomer: form.targetCustomer.trim() || 'B2B Teams',
      custom: true
    };
    saveCustomProducts([prod, ...getCustomProducts()]);
    onSelect(prod);
    setMode('list');
    setForm({ name: '', tagline: '', pitch: '', pricing: '', features: '', targetCustomer: '' });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={mode === 'list' ? 'Product catalog' : 'Custom product pitch'}
      description={mode === 'list'
        ? 'The agent pitches one product per call. Catalog entries come from the backend.'
        : 'Stored in this browser and used exactly like a catalog product.'}
    >
      {mode === 'list' ? (
        <div className="space-y-2.5">
          {products.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); onClose(); }}
              className={cn(
                'w-full rounded-card border p-4 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                active?.id === p.id
                  ? 'border-primary/45 bg-primary/10'
                  : 'border-line bg-surface-2/50 hover:border-line-strong hover:bg-surface-2'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-ink">{p.name}</span>
                {active?.id === p.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-primary">{p.tagline}</p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">{p.pitch}</p>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setMode('custom')}
            className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-3.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary/45 hover:text-ink"
          >
            <Plus className="w-4 h-4" /> Create a custom product pitch
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Product name"><Input value={form.name} onChange={set('name')} placeholder="Acme Analytics" /></Field>
            <Field label="Tagline"><Input value={form.tagline} onChange={set('tagline')} placeholder="AI revenue intelligence" /></Field>
          </div>
          <Field label="Core pitch"><Textarea value={form.pitch} onChange={set('pitch')} placeholder="What the product does and the outcome it delivers..." /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Pricing and trial"><Input value={form.pricing} onChange={set('pricing')} placeholder="$99/mo, 14-day free trial" /></Field>
            <Field label="Target buyer"><Input value={form.targetCustomer} onChange={set('targetCustomer')} placeholder="VP Sales, RevOps" /></Field>
          </div>
          <Field label="Key features" hint="One per line">
            <Textarea value={form.features} onChange={set('features')} placeholder={'Real-time dashboards\nCRM sync\nForecasting AI'} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setMode('list')}>Back</Button>
            <Button onClick={saveCustom} disabled={!form.name.trim() || !form.pitch.trim()}>Save product</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
