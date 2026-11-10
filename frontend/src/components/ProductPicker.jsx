import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import Dialog from './ui/dialog.jsx';
import { Button } from './ui/button.jsx';
import { Input, Label, Textarea } from './ui/input.jsx';
import { cn } from '../lib/cn.js';

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
    try {
      const stored = JSON.parse(localStorage.getItem('vp_custom_products') || '[]');
      localStorage.setItem('vp_custom_products', JSON.stringify([prod, ...stored].slice(0, 10)));
    } catch (e) {}
    onSelect(prod);
    setMode('list');
    setForm({ name: '', tagline: '', pitch: '', pricing: '', features: '', targetCustomer: '' });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} wide title={mode === 'list' ? 'SaaS Product Catalog' : 'Configure Custom Product'}>
      {mode === 'list' ? (
        <div className="space-y-2.5">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); onClose(); }}
              className={cn(
                'w-full text-left p-4 rounded-xl border transition group',
                active?.id === p.id
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-slate-800 hover:border-slate-600 bg-slate-950/50'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{p.name}</span>
                {active?.id === p.id && <Check className="w-4 h-4 text-indigo-400" />}
              </div>
              <p className="text-[11px] text-indigo-300 font-semibold mt-0.5">{p.tagline}</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">{p.pitch}</p>
            </button>
          ))}

          <button
            onClick={() => setMode('custom')}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500/60 transition text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Create a custom product pitch
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Product name *</Label><Input value={form.name} onChange={set('name')} placeholder="Acme Analytics" /></div>
            <div><Label>Tagline</Label><Input value={form.tagline} onChange={set('tagline')} placeholder="AI revenue intelligence" /></div>
          </div>
          <div><Label>Core pitch *</Label><Textarea value={form.pitch} onChange={set('pitch')} placeholder="What the product does and the outcome it delivers..." /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Pricing & trial</Label><Input value={form.pricing} onChange={set('pricing')} placeholder="$99/mo, 14-day free trial" /></div>
            <div><Label>Target buyer</Label><Input value={form.targetCustomer} onChange={set('targetCustomer')} placeholder="VP Sales, RevOps" /></div>
          </div>
          <div><Label>Key features (one per line)</Label><Textarea value={form.features} onChange={set('features')} placeholder={'Real-time dashboards\nCRM sync\nForecasting AI'} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setMode('list')}>Back</Button>
            <Button onClick={saveCustom} disabled={!form.name.trim() || !form.pitch.trim()}>Save product</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
