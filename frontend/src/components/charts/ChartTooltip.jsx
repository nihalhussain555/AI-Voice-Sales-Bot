import React from 'react';

// Recharts draws its own tooltip DOM, so it cannot use Tailwind classes for the
// theme. One shared component keeps every chart on the same token-driven panel.
export default function ChartTooltip({ active, payload, label, format }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-field border border-line bg-surface/95 px-3 py-2 shadow-lifted backdrop-blur-sm">
      {label !== undefined && label !== null && label !== '' && (
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</p>
      )}
      <ul className="space-y-1">
        {payload.map((entry) => {
          const key = entry.dataKey || entry.name || entry.payload?.name;
          return (
            <li key={key} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color || entry.payload?.fill }} />
              <span className="text-ink-muted">{entry.name}</span>
              <span className="ml-auto pl-3 font-mono tabular-nums font-semibold text-ink">
                {format ? format(key, entry.value) : entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
