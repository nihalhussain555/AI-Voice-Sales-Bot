import React from 'react';
import { cn } from '../../lib/cn.js';

// The page title itself lives in the top bar (see AppShell), so this renders the
// description, status meta and page actions without repeating the title.
export function PageHeader({ description, meta, actions, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 mb-5', className)}>
      {description && (
        <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-2xl flex-1 min-w-[18rem]">
          {description}
        </p>
      )}
      {meta && <div className="flex items-center gap-2 flex-wrap">{meta}</div>}
      {actions && <div className="flex items-center gap-2 flex-wrap ml-auto">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ icon: Icon, title, description, actions, className, children }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-ink-muted shrink-0" />}
          <h3 className="text-sm font-bold text-ink tracking-tight truncate">{title}</h3>
        </div>
        {description && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
