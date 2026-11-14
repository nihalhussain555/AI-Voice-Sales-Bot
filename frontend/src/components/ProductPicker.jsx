import React, { useState } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import Dialog, { ConfirmDialog } from './ui/dialog.jsx';
import { Button } from './ui/button.jsx';
import { Field, Input, Textarea } from './ui/input.jsx';
import { cn } from '../lib/cn.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { useToast } from './ui/toast.jsx';

const BLANK = { name: '', tagline: '', pitch: '', pricing: '', features: '', targetCustomer: '' };

export default function ProductPicker({ open, onClose, products, active, onSelect }) {
  const { push: toast } = useToast();
  const { addCustomProduct, removeCustomProduct, customProducts, maxCustomProducts, saveError } = useWorkspace();
  const [mode, setMode] = useState('list'); // list | custom
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const saveCustom = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const created = await addCustomProduct({
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        pitch: form.pitch.trim(),
        pricing: form.pricing.trim(),
        targetCustomer: form.targetCustomer.trim(),
        features: form.features.split('\n').map(s => s.trim()).filter(Boolean)
      });
      // The workspace refetch adds it to the catalog; selecting it here saves the
      // user a second click and matches what the localStorage version did.
      onSelect(created);
      setForm(BLANK);
      setMode('list');
      onClose();
      toast(`“${created.name}” added to your account.`, 'success');
    } catch (err) {
      toast(err.message || 'Could not save that product.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    const target = removing;
    setRemoving(null);
    try {
      await removeCustomProduct(target.id);
      toast(`Removed “${target.name}” from your account.`, 'success');
    } catch (err) {
      toast(err.message || 'Could not remove that product.', 'error');
    }
  };

  const atLimit = customProducts.length >= maxCustomProducts;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        wide
        title={mode === 'list' ? 'Product catalog' : 'Custom product pitch'}
        description={mode === 'list'
          ? 'The agent pitches one product per call. Catalog entries come from the backend; custom ones are saved to your account, not this browser.'
          : `Authored by you and used exactly like a catalog product. ${customProducts.length} of ${maxCustomProducts} used.`}
      >
        {mode === 'list' ? (
          <div className="space-y-2.5">
            {products.map(p => (
              <div key={p.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => { onSelect(p); onClose(); }}
                  className={cn(
                    'flex-1 rounded-card border p-4 text-left transition-all',
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
                {p.custom && (
                  <button
                    type="button"
                    onClick={() => setRemoving(p)}
                    aria-label={`Remove ${p.name}`}
                    className="mt-3 shrink-0 rounded-field p-2 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setMode('custom')}
              disabled={atLimit}
              className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-3.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary/45 hover:text-ink disabled:opacity-45 disabled:pointer-events-none"
            >
              <Plus className="w-4 h-4" />
              {atLimit ? `Custom products are capped at ${maxCustomProducts}` : 'Create a custom product pitch'}
            </button>

            {saveError && (
              <p className="text-[11px] leading-relaxed text-danger">{saveError.message}</p>
            )}
          </div>
        ) : (
          <form onSubmit={saveCustom} className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Product name">
                <Input value={form.name} onChange={set('name')} maxLength={80} required placeholder="Acme Analytics" />
              </Field>
              <Field label="Tagline">
                <Input value={form.tagline} onChange={set('tagline')} maxLength={140} placeholder="AI revenue intelligence" />
              </Field>
            </div>
            <Field label="Core pitch" hint="This text drives the agent's system prompt, so it is capped at 1200 characters.">
              <Textarea value={form.pitch} onChange={set('pitch')} maxLength={1200} required placeholder="What the product does and the outcome it delivers..." />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Pricing and trial">
                <Input value={form.pricing} onChange={set('pricing')} maxLength={300} placeholder="$99/mo, 14-day free trial" />
              </Field>
              <Field label="Target buyer">
                <Input value={form.targetCustomer} onChange={set('targetCustomer')} maxLength={160} placeholder="VP Sales, RevOps" />
              </Field>
            </div>
            <Field label="Key features" hint="One per line, up to 12.">
              <Textarea value={form.features} onChange={set('features')} placeholder={'Real-time dashboards\nCRM sync\nForecasting AI'} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setMode('list')}>Back</Button>
              <Button type="submit" loading={busy} disabled={!form.name.trim() || !form.pitch.trim()}>
                Save product
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="Remove custom product?"
        message={`“${removing?.name}” is deleted from your account. Calls already placed with it keep their transcript and summary.`}
        confirmLabel="Remove"
      />
    </>
  );
}
