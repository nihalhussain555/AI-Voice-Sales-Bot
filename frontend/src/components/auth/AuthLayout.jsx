import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, PhoneCall, LockKeyhole } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { BrandMark, BrandWordmark } from '../ui/brand.jsx';

// The signed-out shell: the same navy/purple brand language as the console,
// with the card left intact rather than dissolving into the page.
export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="relative min-h-screen bg-canvas-deep text-ink overflow-hidden">
      {/* Brand wash. Two soft radials over the deep canvas is the whole effect —
          anything busier fights with the card. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[34rem] w-[34rem] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] rounded-full bg-violet/20 blur-[130px]" />
        <div className="absolute bottom-[-14rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-electric/15 blur-[140px]" />
        <div className="absolute inset-0 dot-grid opacity-[0.35]" />
      </div>

      <div className="relative flex min-h-screen flex-col">
        <header className="px-5 py-5 sm:px-8">
          <Link to="/" className="group inline-flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-3 transition-transform duration-200 group-hover:scale-[1.03]">
              <BrandMark labelled={false} size="lg" />
              <BrandWordmark size="lg" />
            </span>
            <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted">Autonomous sales AE</span>
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className={cn('w-full', wide ? 'max-w-xl' : 'max-w-md')}>
            <div className="animate-slide-up rounded-card border border-line bg-surface/70 p-6 shadow-lifted backdrop-blur-xl edge-light sm:p-8">
              <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </div>

            {footer && <div className="mt-4 animate-fade-in text-center text-[12px] text-ink-muted">{footer}</div>}

            <ul className="mx-auto mt-7 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-ink-muted">
              <li className="inline-flex items-center gap-1.5">
                <LockKeyhole className="w-3.5 h-3.5 text-primary" /> Passwords are bcrypt-hashed
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> HttpOnly session cookie
              </li>
              <li className="inline-flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-primary" /> Your calls stay yours
              </li>
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}

// Small switch between the two halves of the signed-out pair.
export function AuthSwitch({ prompt, label, to }) {
  return (
    <p className="text-center text-[12px] text-ink-muted">
      {prompt}{' '}
      <Link to={to} className="font-semibold text-primary hover:text-primary-hover underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}

// One-line error that belongs to the whole form rather than a field.
export function FormNote({ tone = 'error', children }) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-field border px-3 py-2.5 text-[12px] leading-relaxed',
        tone === 'error' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-primary/35 bg-primary/10 text-ink-soft'
      )}
    >
      {children}
    </p>
  );
}
