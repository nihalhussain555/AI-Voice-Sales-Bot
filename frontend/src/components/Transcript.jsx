import React, { useEffect, useRef } from 'react';
import { Bot, Loader2, User } from 'lucide-react';
import { cn } from '../lib/cn.js';

const ROW = {
  bot: {
    wrap: '',
    bubble: 'bg-surface-2 border border-line text-ink',
    chip: 'bg-primary/15 text-primary',
    label: 'Agent'
  },
  customer: {
    wrap: 'flex-row-reverse',
    bubble: 'bg-success/10 border border-success/25 text-ink',
    chip: 'bg-success/15 text-success',
    label: 'Customer'
  }
};

export function TranscriptRow({ turn, className }) {
  const speaker = turn.sender === 'customer' ? 'customer' : 'bot';
  const style = ROW[speaker];
  const Icon = speaker === 'bot' ? Bot : User;

  return (
    <div className={cn('flex gap-2.5 animate-fade-in', style.wrap, className)}>
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', style.chip)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className={cn('max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed', style.bubble, speaker === 'customer' && 'rounded-tr-md', speaker === 'bot' && 'rounded-tl-md')}>
        {/* dir=auto lets an Arabic turn lay out right-to-left while every other
            language, and mixed product names inside it, stay left-to-right. */}
        <p className="whitespace-pre-wrap break-words" dir="auto">{turn.text}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-ink-muted">
          <span>{turn.time || ''}</span>
          <span className="uppercase tracking-wider">{style.label}</span>
        </div>
      </div>
    </div>
  );
}

// Shared by the live demo console, the phone monitor and the call-history detail.
export default function Transcript({
  turns = [], interimText, thinking, empty, className, bodyClassName, scrollable = true
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollable) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, interimText, thinking, scrollable]);

  return (
    <div
      ref={scrollRef}
      className={cn('space-y-3.5', scrollable && 'flex-1 overflow-y-auto', className)}
      aria-live="polite"
      aria-label="Call transcript"
    >
      {turns.length === 0 && !interimText && !thinking ? (
        <div className={cn('flex flex-col items-center justify-center gap-2 py-14 text-center', bodyClassName)}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-muted">
            <Bot className="h-5 w-5" />
          </span>
          <p className="text-xs font-semibold text-ink-soft">{empty?.title || 'No conversation yet'}</p>
          {empty?.message && <p className="max-w-xs text-[11px] leading-relaxed text-ink-muted">{empty.message}</p>}
        </div>
      ) : (
        <>
          {turns.map((turn, index) => <TranscriptRow key={`${index}-${turn.time || ''}`} turn={turn} />)}
          {thinking && (
            <div className="flex items-center gap-2 pl-10 text-xs text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Agent is thinking…
            </div>
          )}
          {interimText && (
            <p className="animate-fade-in pl-10 text-xs italic text-success/80" dir="auto">“{interimText}”</p>
          )}
        </>
      )}
    </div>
  );
}
