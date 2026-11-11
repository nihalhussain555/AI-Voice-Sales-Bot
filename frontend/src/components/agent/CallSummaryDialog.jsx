import React from 'react';
import { Download } from 'lucide-react';
import { resolveAsset } from '../../services/api.js';
import { Badge, StatusBadge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import Dialog from '../ui/dialog.jsx';
import { SectionHeader } from '../ui/page-header.jsx';

function SummaryList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shared by the post-call dialog and the call-history detail drawer.
export function CallSummaryBody({ call }) {
  const s = call.summary || {};
  const scoreTone = s.dealScore >= 80 ? 'emerald' : s.dealScore >= 50 ? 'amber' : 'rose';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status || call.status} />
        <Badge variant="slate">{call.product}</Badge>
        {call.language && <Badge variant="slate">{call.language}</Badge>}
        {call.channel === 'phone' && <Badge variant="sky">Phone</Badge>}
        {typeof s.dealScore === 'number' && (
          <Badge variant={scoreTone}>Deal score {s.dealScore}%</Badge>
        )}
        {s.sentiment && <Badge variant="violet">{s.sentiment}</Badge>}
      </div>

      {s.overview && <p className="text-sm leading-relaxed text-ink-soft">{s.overview}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryList title="Requirements" items={s.requirements} />
        <SummaryList title="Objections" items={s.objections} />
      </div>
      <SummaryList title="Next steps" items={s.nextSteps} />

      {call.recordingUrl && (
        <div>
          <SectionHeader title="Call recording" className="mb-1.5" />
          <audio controls src={resolveAsset(call.recordingUrl)} className="w-full" />
        </div>
      )}
    </div>
  );
}

export default function CallSummaryDialog({ open, onClose, call }) {
  if (!call) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Call summary"
      description="Generated from the transcript as soon as the call ended."
      footer={
        <>
          {call.recordingUrl && (
            <a
              href={resolveAsset(call.recordingUrl)}
              download="call-recording.webm"
              className="mr-auto inline-flex items-center gap-2 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              <Download className="w-3.5 h-3.5" /> Download recording
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      }
    >
      <CallSummaryBody call={call} />
    </Dialog>
  );
}
