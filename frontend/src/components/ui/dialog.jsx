import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './button.jsx';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

export default function Dialog({
  open, onClose, title, description, children, footer,
  wide = false, size, closeLabel = 'Close dialog'
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Lock background scroll while a modal is up, otherwise the page behind
    // the dialog scrolls under it on touch devices.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-canvas-deep/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative w-full bg-surface border border-line rounded-card shadow-lifted animate-scale-in',
          'max-h-[85vh] flex flex-col outline-none',
          wide ? SIZES.lg : SIZES[size] || SIZES.md
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            {description && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="p-1.5 rounded-field text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-line flex items-center justify-end gap-2 shrink-0 bg-surface-3/40 rounded-b-card">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Destructive confirmations share one shape so deleting anything always looks
// and behaves the same.
export function ConfirmDialog({
  open, onClose, onConfirm, title = 'Are you sure?', message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', busy
}) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0',
          tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-primary/15 text-primary')}>
          <AlertTriangle className="w-5 h-5" />
        </span>
        <p className="text-sm text-ink-soft leading-relaxed">{message}</p>
      </div>
    </Dialog>
  );
}
