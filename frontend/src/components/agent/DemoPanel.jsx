import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Globe, Mic, MicOff, Phone, PhoneOff, ShieldCheck, User, Volume2
} from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { useApp } from '../AppShell.jsx';
import useCallSession from '../../hooks/useCallSession.js';
import { formatClock } from '../../lib/customers.js';
import { useToast } from '../ui/toast.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.jsx';
import { Button } from '../ui/button.jsx';
import { Badge, StatusBadge } from '../ui/badge.jsx';
import { Input } from '../ui/input.jsx';
import Dialog from '../ui/dialog.jsx';
import { SectionHeader } from '../ui/page-header.jsx';
import Transcript from '../Transcript.jsx';
import AudioVisualizer from '../AudioVisualizer.jsx';
import CallSummaryDialog from './CallSummaryDialog.jsx';
import { SUPPORTED_LANGUAGES } from '../../lib/languages.js';

const QUICK_PROMPTS = [
  'Tell me about pricing',
  'How does the setup work?',
  'We already use a competitor',
  'I need to discuss with my team',
  'Book me a demo',
  "I'm not interested"
];

const STATUS_TEXT = {
  idle: 'Ready to dial',
  connecting: 'Connecting…',
  speaking: 'Agent is speaking',
  listening: 'Listening to you',
  processing: 'Thinking…',
  ended: 'Call ended'
};

const STATUS_TINT = {
  idle: 'text-ink',
  connecting: 'text-warn',
  speaking: 'text-primary',
  listening: 'text-success',
  processing: 'text-warn',
  ended: 'text-ink-muted'
};

// Browser-voice demo: Web Speech API on this machine, no telephone involved.
export default function DemoPanel() {
  const { product, health, openProductPicker } = useApp();
  const { push: toast } = useToast();
  const [language, setLanguage] = useState('English');
  const [consentOpen, setConsentOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [typedMsg, setTypedMsg] = useState('');

  const session = useCallSession({
    product,
    language,
    onError: (msg, type = 'error') => toast(msg, type),
    onCallSaved: (record) => {
      setSummaryOpen(true);
      if (record.summary?.status === 'Converted') {
        confetti({ particleCount: 130, spread: 80, origin: { y: 0.6 } });
      }
    }
  });

  const { status, duration, transcript, interimText, isMuted, lastCall } = session;
  const live = status !== 'idle' && status !== 'ended';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-5">
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">Call status</p>
                <p className={cn('mt-1 text-lg font-extrabold leading-tight', STATUS_TINT[status] || 'text-ink')}>
                  {STATUS_TEXT[status] || 'Ready'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-lg',
                      isMuted ? 'bg-danger/15 text-danger' : live ? 'bg-success/15 text-success' : 'bg-surface-2 text-ink-muted'
                    )}
                    title={isMuted ? 'Microphone muted' : live ? 'Microphone open' : 'Microphone idle'}
                  >
                    {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-[11px] font-semibold text-ink-muted">
                    {isMuted ? 'Muted' : live ? 'Mic live' : 'Mic idle'}
                  </span>
                  <Volume2 className="ml-auto h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-ink-muted">Speaker</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-2xl font-bold tabular-nums text-ink leading-none">{formatClock(duration)}</p>
                <Badge className="mt-2" variant={health?.groqKeyConfigured ? 'emerald' : 'amber'} dot>
                  {health?.groqKeyConfigured ? 'Groq AI' : 'Demo engine'}
                </Badge>
              </div>
            </div>

            <div className="mb-5">
              <AudioVisualizer
                callStatus={status}
                isBotSpeaking={status === 'speaking'}
                isCustomerSpeaking={status === 'listening' && !!interimText}
              />
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <Globe className="mr-1 h-4 w-4 text-ink-muted" />
              {SUPPORTED_LANGUAGES.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLanguage(item)}
                  disabled={live}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[11px] font-bold transition-all disabled:opacity-50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    language === item ? 'bg-primary text-primary-ink shadow-soft' : 'bg-surface-2 text-ink-muted hover:text-ink'
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            {!live ? (
              <Button size="lg" className="w-full" disabled={!product} onClick={() => setConsentOpen(true)}>
                <Phone className="h-4 w-4" /> Start demo call
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant={isMuted ? 'danger' : 'secondary'} size="lg" className="flex-1" onClick={session.toggleMute}>
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </Button>
                <Button variant="danger" size="lg" className="flex-1" onClick={session.endCall}>
                  <PhoneOff className="h-4 w-4" /> End
                </Button>
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-ink-muted">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
              Audio is captured in your browser and uploaded only when the call ends. No phone number is involved.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <SectionHeader title="Customer in this demo" className="mb-0" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                <User className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-ink">Prospective Customer</p>
                <p className="truncate text-[11px] text-ink-muted">Simulated lead · {language}</p>
              </div>
            </div>
            <dl className="space-y-2 text-[11px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Pipeline entry</dt>
                <dd className="font-semibold text-ink-soft">Saved to Customers after the call</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Turns so far</dt>
                <dd className="font-mono tabular-nums font-semibold text-ink-soft">{transcript.length}</dd>
              </div>
            </dl>
            {lastCall?.status && (
              <div className="flex items-center gap-2 border-t border-line pt-3">
                <span className="text-[11px] text-ink-muted">Last outcome</span>
                <StatusBadge status={lastCall.status} />
              </div>
            )}
          </CardContent>
        </Card>

        {product && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">Product being pitched</CardTitle>
              <button
                type="button"
                onClick={openProductPicker}
                className="text-[11px] font-semibold text-primary transition-colors hover:text-primary-hover"
              >
                Change
              </button>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-bold text-ink">{product.name}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-primary">{product.tagline}</p>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{product.pitch}</p>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5 text-xs">
                <span className="text-ink-muted">Pricing</span>
                <span className="text-right font-semibold text-success">{product.pricing}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="flex min-h-[520px] flex-col lg:col-span-7">
        <CardHeader className="border-b border-line">
          <div>
            <CardTitle>Live transcript</CardTitle>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {transcript.length} turn{transcript.length === 1 ? '' : 's'} · {language} · interrupting the agent works
            </p>
          </div>
          {live && <Badge variant="primary" dot>recording</Badge>}
        </CardHeader>
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <Transcript
            turns={transcript}
            interimText={interimText}
            thinking={status === 'processing'}
            empty={{
              title: 'Start a call to see the conversation here',
              message: 'Allow the microphone when the browser asks, then speak normally.'
            }}
            className="min-h-[240px] px-0"
          />
        </div>
        <div className="space-y-2.5 border-t border-line px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                type="button"
                disabled={!live}
                onClick={() => session.sendTyped(prompt)}
                className="rounded-full border border-line bg-surface-2/70 px-2.5 py-1 text-[10px] font-semibold text-ink-soft transition-all hover:border-primary/40 hover:bg-primary/15 hover:text-primary disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typedMsg.trim() && live) {
                session.sendTyped(typedMsg.trim());
                setTypedMsg('');
              }
            }}
            className="flex gap-2"
          >
            <Input
              value={typedMsg}
              onChange={(event) => setTypedMsg(event.target.value)}
              placeholder={live ? 'Type a response (works without a microphone)…' : 'Start a call to type'}
              disabled={!live}
              dir="auto"
            />
            <Button type="submit" disabled={!live || !typedMsg.trim()}>Send</Button>
          </form>
        </div>
      </Card>

      <Dialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        title="Recording and AI consent"
        description="Shown once before the browser microphone is switched on."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={() => { setConsentOpen(false); session.startCall(); }}>
              <Phone className="h-4 w-4" /> I agree — start call
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>This call uses your <strong>microphone</strong> and records audio for the call archive.</p>
          <p>
            Replies come from {health?.groqKeyConfigured
              ? <>the AI sales engine (Groq · <code className="font-mono text-xs">{health.chatModel}</code>)</>
              : 'the built-in rule-based demo engine'}
            . A summary, deal score and lead record are produced when the call ends.
          </p>
          <p className="text-xs text-ink-muted">Allow the browser microphone prompt when it appears.</p>
        </div>
      </Dialog>

      <CallSummaryDialog open={summaryOpen} onClose={() => setSummaryOpen(false)} call={lastCall} />
    </div>
  );
}
