import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import {
  Phone, PhoneOff, Mic, MicOff, Globe, Bot, User, Loader2, ShieldCheck, Download
} from 'lucide-react';
import { useApp } from '../components/AppShell.jsx';
import useCallSession from '../hooks/useCallSession.js';
import { api, resolveAsset } from '../services/api.js';
import { cn } from '../lib/cn.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, StatusBadge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import Dialog from '../components/ui/dialog.jsx';
import { useToast } from '../components/ui/toast.jsx';
import AudioVisualizer from '../components/AudioVisualizer.jsx';

const LANGUAGES = ['English', 'Hindi', 'Telugu'];
const QUICK_PROMPTS = [
  'Tell me about pricing',
  'How does the setup work?',
  'We already use a competitor',
  'I need to discuss with my team',
  'Book me a demo',
  "I'm not interested"
];

export default function CallPage() {
  const { product, health, openProductPicker } = useApp();
  const { push: toast } = useToast();
  const [language, setLanguage] = useState('English');
  const [consentOpen, setConsentOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [typedMsg, setTypedMsg] = useState('');
  const scrollRef = useRef(null);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript, interimText]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const live = status !== 'idle' && status !== 'ended';
  const statusLabel = {
    idle: 'Ready', connecting: 'Connecting…', speaking: 'Jordan is speaking',
    listening: 'Listening to you', processing: 'Thinking…', ended: 'Call ended'
  }[status];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Call status</div>
                  <div className={cn('text-lg font-extrabold mt-0.5',
                    status === 'speaking' ? 'text-indigo-400' :
                    status === 'listening' ? 'text-emerald-400' :
                    status === 'processing' ? 'text-amber-400' : 'text-white')}>
                    {statusLabel}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold text-white tabular-nums">{fmt(duration)}</div>
                  <Badge variant={health?.groqKeyConfigured ? 'emerald' : 'amber'} className="mt-1">
                    {health?.groqKeyConfigured ? 'Groq · Live AI' : 'Demo engine'}
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

              {/* Language */}
              <div className="flex items-center gap-2 mb-5">
                <Globe className="w-4 h-4 text-slate-500" />
                {LANGUAGES.map(l => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition',
                      language === l ? 'bg-indigo-600 text-white' : 'bg-slate-800/70 text-slate-400 hover:text-white')}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Controls */}
              {!live ? (
                <div className="flex gap-2">
                  <Button size="lg" className="flex-1" onClick={() => setConsentOpen(true)} disabled={!product}>
                    <Phone className="w-4 h-4" /> Start Voice Call
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant={isMuted ? 'danger' : 'secondary'}
                    size="lg"
                    className="flex-1"
                    onClick={session.toggleMute}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Button>
                  <Button variant="danger" size="lg" className="flex-1" onClick={session.endCall}>
                    <PhoneOff className="w-4 h-4" /> End Call
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-4">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80 shrink-0" />
                <span>Microphone audio recorded locally, uploaded on call end.</span>
              </div>
            </CardContent>
          </Card>

          {/* Product card */}
          {product && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[11px] uppercase tracking-wider text-indigo-400">Product being sold</CardTitle>
                <button onClick={openProductPicker} className="text-xs text-slate-400 hover:text-white font-medium">Change</button>
              </CardHeader>
              <CardContent>
                <h3 className="text-base font-bold text-white">{product.name}</h3>
                <p className="text-[11px] text-indigo-300 font-semibold mt-0.5">{product.tagline}</p>
                <p className="text-xs text-slate-300 leading-relaxed mt-2.5">{product.pitch}</p>
                <div className="flex items-center justify-between mt-3 py-1.5 border-t border-slate-800/60 text-xs">
                  <span className="text-slate-500">Pricing</span>
                  <span className="text-emerald-400 font-semibold text-right">{product.pricing}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: live transcript */}
        <Card className="lg:col-span-7 flex flex-col min-h-[540px]">
          <CardHeader className="border-b border-slate-800/60">
            <CardTitle>Live transcript</CardTitle>
            <span className="text-[11px] text-slate-500">{transcript.length} turns · {language}</span>
          </CardHeader>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 min-h-[300px]">
            {transcript.length === 0 && !live && (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 py-16">
                <Bot className="w-10 h-10 opacity-40" />
                <p className="text-xs font-medium">Start a call to see the live conversation here.</p>
                <p className="text-[11px]">Speak naturally — interrupting Jordan works too.</p>
              </div>
            )}
            {transcript.map((m, i) => (
              <div key={i} className={cn('flex gap-2.5 animate-fadeIn', m.sender === 'customer' && 'flex-row-reverse')}>
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                  m.sender === 'bot' ? 'bg-indigo-600/25 text-indigo-300' : 'bg-emerald-600/25 text-emerald-300')}>
                  {m.sender === 'bot' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.sender === 'bot' ? 'bg-slate-800/80 text-slate-100' : 'bg-emerald-900/40 border border-emerald-800/50 text-emerald-50')}>
                  {m.text}
                  <div className="text-[10px] opacity-50 mt-1 font-mono">{m.time}</div>
                </div>
              </div>
            ))}
            {status === 'processing' && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pl-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> Jordan is thinking…
              </div>
            )}
            {interimText && (
              <div className="text-xs text-emerald-300/70 italic pl-2 animate-fadeIn">“{interimText}”</div>
            )}
          </div>

          {/* Quick prompts + typed input */}
          <div className="border-t border-slate-800/60 px-5 py-4 space-y-2.5">
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  disabled={!live}
                  onClick={() => session.sendTyped(q)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-300 hover:bg-indigo-600/30 hover:text-indigo-200 disabled:opacity-40 transition"
                >
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (typedMsg.trim() && live) { session.sendTyped(typedMsg.trim()); setTypedMsg(''); } }}
              className="flex gap-2"
            >
              <Input
                value={typedMsg}
                onChange={e => setTypedMsg(e.target.value)}
                placeholder={live ? 'Type your response (works without a microphone)…' : 'Start a call to chat'}
                disabled={!live}
              />
              <Button type="submit" disabled={!live || !typedMsg.trim()}>Send</Button>
            </form>
          </div>
        </Card>
      </div>

      {/* Consent modal */}
      <Dialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        title="Recording & AI consent"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={() => { setConsentOpen(false); session.startCall(); }}>
              <Phone className="w-4 h-4" /> I agree — start call
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>This call will use your <strong>microphone</strong> for voice and record audio for the call archive.</p>
          <p>Conversation replies are generated by an AI sales engine ({health?.groqKeyConfigured ? `Groq · ${health?.chatModel}` : 'built-in demo engine'}). A summary is produced when the call ends.</p>
          <p className="text-xs text-slate-500">Allow the browser microphone prompt when it appears after starting.</p>
        </div>
      </Dialog>

      {/* Post-call summary */}
      <PostCallSummary open={summaryOpen} onClose={() => setSummaryOpen(false)} call={lastCall} />
    </div>
  );
}

export function PostCallSummary({ open, onClose, call }) {
  if (!call) return null;
  const s = call.summary || {};

  return (
    <Dialog open={open} onClose={onClose} wide title="Call summary">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} />
          <Badge variant="slate">{call.product}</Badge>
          <Badge variant="slate">{call.language}</Badge>
          {typeof s.dealScore === 'number' && (
            <Badge variant={s.dealScore >= 80 ? 'emerald' : s.dealScore >= 50 ? 'amber' : 'rose'}>
              Deal score {s.dealScore}%
            </Badge>
          )}
        </div>

        {s.overview && <p className="text-sm text-slate-300 leading-relaxed">{s.overview}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <SummaryList title="Requirements" items={s.requirements} />
          <SummaryList title="Objections" items={s.objections} />
        </div>
        <SummaryList title="Next steps" items={s.nextSteps} />

        {call.recordingUrl ? (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Call recording</div>
            <audio controls src={resolveAsset(call.recordingUrl)} className="w-full" />
          </div>
        ) : (
          <p className="text-xs text-slate-600">No playable recording was stored for this call.</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <a href={resolveAsset(call.recordingUrl) || '#'} download={call.recordingUrl ? 'call-recording.webm' : undefined}
             className={cn('inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition mr-auto', !call.recordingUrl && 'hidden')}>
            <Download className="w-3.5 h-3.5" /> Download recording
          </a>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

function SummaryList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}
