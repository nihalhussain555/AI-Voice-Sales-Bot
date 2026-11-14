import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { fetchAuthenticatedBlob } from '../../services/api.js';
import { Badge, StatusBadge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import Dialog from '../ui/dialog.jsx';
import { SectionHeader } from '../ui/page-header.jsx';

// Recordings are served per owner, so the URL is not public: the browser has to
// ask for it as the signed-in user and play the blob it gets back. An
// <audio src> would be a subresource request, which withholds the session
// cookie whenever the API is on another origin.
function Recording({ url }) {
  const [state, setState] = useState({ status: 'loading', href: null });

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    let objectUrl = null;
    setState({ status: 'loading', href: null });

    fetchAuthenticatedBlob(url)
      .then((href) => {
        if (!alive) {
          URL.revokeObjectURL(href);
          return;
        }
        objectUrl = href;
        setState({ status: 'ready', href });
      })
      .catch(() => { if (alive) setState({ status: 'error', href: null }); });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (state.status === 'loading') {
    return <p className="text-[11px] text-ink-muted">Loading recording…</p>;
  }
  if (state.status === 'error') {
    return (
      <p className="text-[11px] leading-relaxed text-danger">
        This recording could not be loaded. It may have been removed from the server.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <audio controls src={state.href} className="w-full" />
      <a
        href={state.href}
        download="call-recording.webm"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        <Download className="w-3.5 h-3.5" /> Download recording
      </a>
    </div>
  );
}

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
          <Recording url={call.recordingUrl} />
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
        <Button variant="secondary" onClick={onClose}>Close</Button>
      }
    >
      <CallSummaryBody call={call} />
    </Dialog>
  );
}
