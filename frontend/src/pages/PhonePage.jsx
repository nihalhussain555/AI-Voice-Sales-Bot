// Real phone calling (Twilio). Deliberately separate from /call, which stays the
// browser-voice demo: this page dials an actual number and follows the live call.

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CheckCircle2, Loader2, Phone,
  PhoneCall, PhoneOff, RefreshCw, Settings2, User
} from 'lucide-react';
import { useApp } from '../components/AppShell.jsx';
import { api } from '../services/api.js';
import { cn } from '../lib/cn.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, OutcomeBadge } from '../components/ui/badge.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { Table, THead, Th, Td, Tr } from '../components/ui/table.jsx';
import { useToast } from '../components/ui/toast.jsx';

const STEPS = [
  { key: 'queued', label: 'Dialing' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'active', label: 'Talking' }
];

// Mirrors backend normalizeE164: separators are forgiven, a country code is not
// (guessing one could dial a different country entirely).
function toE164(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) return '';
  s = s.replace(/[^\d+]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : '';
}

const fmtClock = (s) => `${String(Math.floor((s || 0) / 60)).padStart(2, '0')}:${String((s || 0) % 60).padStart(2, '0')}`;

export default function PhonePage() {
  const { product, openProductPicker } = useApp();
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [number, setNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedSid, setSelectedSid] = useState(null);

  const e164 = toE164(number);
  const numberLooksValid = e164 !== '' || number.trim() === '';

  const { data: config } = useQuery({
    queryKey: ['phone-config'],
    queryFn: () => api.phoneConfig().catch(() => null),
    retry: false,
    refetchInterval: 30000
  });

  const { data: callsData, isLoading } = useQuery({
    queryKey: ['phone-calls'],
    queryFn: api.phoneCalls,
    // Poll fast only while a call is actually running.
    refetchInterval: (query) => (query.state.data?.calls?.some(c => !c.terminal) ? 1500 : 8000)
  });
  const calls = callsData?.calls || [];
  const active = calls.filter(c => !c.terminal);
  const selected = calls.find(c => c.callSid === selectedSid) || active[0] || calls[0] || null;

  useEffect(() => {
    if (selected && selected.callSid !== selectedSid) setSelectedSid(selected.callSid);
  }, [selected, selectedSid]);

  const refreshList = () => qc.invalidateQueries({ queryKey: ['phone-calls'] });

  const dial = useMutation({
    mutationFn: () => api.phoneDial({ to: e164, productKey: product?.id, customerName: customerName.trim() || undefined }),
    onSuccess: (res) => {
      setSelectedSid(res.call.callSid);
      setNumber('');
      setCustomerName('');
      toast(`Dialing ${res.call.to}…`, 'success');
      refreshList();
    },
    onError: (e) => {
      toast(e.data?.hint ? `${e.message} — ${e.data.hint}` : e.message, 'error');
      refreshList();
    }
  });

  const canDial = Boolean(e164 && config?.dialReady && !dial.isPending);

  const hangup = useMutation({
    mutationFn: api.phoneHangup,
    onSuccess: (res) => toast(`Call ${res.call.outcomeLabel || 'ended'}`, 'info'),
    onError: (e) => toast(`Hangup failed: ${e.message}`, 'error'),
    onSettled: refreshList
  });

  const poll = useMutation({
    mutationFn: api.phoneRefresh,
    onSuccess: () => refreshList(),
    onError: (e) => toast(e.message, 'error')
  });

  const notLive = config && config.mode !== 'live';

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-400" /> Live Phone Calling
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real outbound and inbound calls on the Twilio number, answered by the AI agent over live audio.
          </p>
        </div>
        <ModeBadge config={config} />
      </div>

      {notLive && <SetupNotice config={config} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Dialer */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Place a call</CardTitle>
                <CardDescription>Number in international format, e.g. +14155551234</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Customer name (optional)</Label>
                <Input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Priya N."
                />
              </div>
              <div>
                <Label>Phone number</Label>
                <Input
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canDial) dial.mutate(); }}
                  placeholder="+1 415 555 1234"
                  inputMode="tel"
                  className={cn(!numberLooksValid && 'border-rose-500/60 focus:ring-rose-500/50')}
                />
                {!numberLooksValid && (
                  <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Include the country code — we never guess it.
                  </p>
                )}
                {number.trim() && numberLooksValid && e164 !== number.trim() && (
                  <p className="text-[11px] text-slate-500 mt-1.5">Will dial <span className="font-mono text-slate-300">{e164}</span></p>
                )}
              </div>

              <button
                type="button"
                onClick={openProductPicker}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-900 transition text-left"
              >
                <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-300 truncate">
                  Pitching: {product?.name || 'Select product'}
                </span>
              </button>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="success"
                  className="flex-1"
                  disabled={!e164 || !config?.dialReady || dial.isPending}
                  onClick={() => dial.mutate()}
                >
                  {dial.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  {dial.isPending ? 'Dialling…' : 'Call now'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => poll.mutate(selected?.callSid)} disabled={!selected || poll.isPending}>
                  <RefreshCw className={cn('w-3.5 h-3.5', poll.isPending && 'animate-spin')} /> Status
                </Button>
              </div>

              {config && !config.aiReady && (
                <p className="text-[11px] text-amber-400/90 leading-relaxed">
                  Groq key missing on the server: calls will connect but the agent cannot listen or speak.
                  Set <code className="font-mono">GROQ_API_KEY</code> in <code className="font-mono">backend/.env</code>.
                </p>
              )}
              {config?.dialReady && (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {config.activeCalls}/{config.maxConcurrentCalls} lines busy · calls end automatically after
                  {' '}{config.maxCallMinutes} min. Trial accounts can only dial numbers verified in the Twilio console.
                </p>
              )}
            </CardContent>
          </Card>

          <CallMonitor call={selected} onHangup={(sid) => hangup.mutate(sid)} hangingUp={hangup.isPending} />
        </div>

        {/* Attempts */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Call attempts</CardTitle>
                <CardDescription>Every dial and inbound ring is tracked, answered or not</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={refreshList}><RefreshCw className="w-3.5 h-3.5" /></Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
              ) : calls.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No calls yet from this server run. Attempts are kept in memory for 30 minutes; finished calls are
                  archived in <span className="text-slate-400">Call History</span>.
                </p>
              ) : (
                <Table>
                  <THead><tr>
                    <Th>Number</Th><Th>Direction</Th><Th>State</Th><Th>Duration</Th><Th>Turns</Th>
                  </tr></THead>
                  <tbody>
                    {calls.map(c => (
                      <Tr
                        key={c.callSid}
                        onClick={() => setSelectedSid(c.callSid)}
                        className={cn('cursor-pointer', selected?.callSid === c.callSid && 'bg-indigo-950/30')}
                      >
                        <Td>
                          <div className="font-mono text-xs text-white">{c.to || c.from}</div>
                          {c.customerName && <div className="text-[11px] text-slate-500">{c.customerName}</div>}
                        </Td>
                        <Td><Badge variant="slate">{c.direction === 'inbound' ? 'In' : 'Out'}</Badge></Td>
                        <Td><StateBadge call={c} /></Td>
                        <Td className="font-mono tabular-nums">{fmtClock(c.durationSec)}</Td>
                        <Td className="font-mono">{c.turns}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ModeBadge({ config }) {
  if (!config) return <Badge variant="slate">Checking phone status…</Badge>;
  if (config.mode === 'live') return <Badge variant="emerald"><CheckCircle2 className="w-3 h-3" /> Live mode</Badge>;
  if (config.inboundReady) return <Badge variant="amber">Inbound only</Badge>;
  return <Badge variant="amber"><Settings2 className="w-3 h-3" /> Not configured</Badge>;
}

function StateBadge({ call }) {
  if (call.terminal) return <OutcomeBadge outcome={call.outcome} label={call.outcomeLabel} />;
  const variant = call.state === 'active' ? 'emerald' : call.state === 'ringing' ? 'amber' : 'indigo';
  return <Badge variant={variant}>{STEPS.find(s => s.key === call.state)?.label || call.state}</Badge>;
}

function SetupNotice({ config }) {
  const missing = config.missing || [];
  return (
    <Card className="border-amber-500/30 bg-amber-950/10">
      <CardContent className="pt-5 space-y-2 text-xs text-slate-300 leading-relaxed">
        <p className="flex items-center gap-2 font-bold text-amber-300">
          <AlertTriangle className="w-4 h-4" /> Live calling is switched off
        </p>
        <p>
          Add these to <code className="font-mono text-slate-200">backend/.env</code> and restart the backend:
          {' '}{missing.length ? missing.map(m => <code key={m} className="font-mono text-slate-200 mx-1">{m}</code>) : 'your Twilio credentials'}
        </p>
        <p className="text-slate-400">
          Then in the Twilio console point the number&apos;s <strong>Voice webhook</strong> to{' '}
          <code className="font-mono text-slate-300">{'{PUBLIC_BASE_URL}'}/api/twilio/voice</code> and the{' '}
          <strong>Status Callback</strong> to{' '}
          <code className="font-mono text-slate-300">{'{PUBLIC_BASE_URL}'}/api/twilio/events</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function CallMonitor({ call, onHangup, hangingUp }) {
  const stepIndex = useMemo(() => {
    if (!call) return -1;
    const i = STEPS.findIndex(s => s.key === call.state);
    return call.terminal ? STEPS.length : i;
  }, [call]);

  if (!call) {
    return (
      <Card>
        <CardHeader><CardTitle>Live call</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-slate-500">Dial a number or wait for an inbound call to see it here.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="font-mono">{call.to || call.from}</span>
            <StateBadge call={call} />
          </CardTitle>
          <CardDescription>
            {call.customerName || (call.direction === 'inbound' ? 'Inbound caller' : 'Prospect')} · {call.product || '—'}
          </CardDescription>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold text-white tabular-nums">{fmtClock(call.durationSec)}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{call.live ? 'audio live' : 'no media'}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              <li className={cn('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider',
                i < stepIndex ? 'text-emerald-400' : i === stepIndex ? 'text-white' : 'text-slate-600')}>
                <span className={cn('w-2 h-2 rounded-full',
                  i < stepIndex ? 'bg-emerald-400' : i === stepIndex ? 'bg-indigo-400 animate-pulse' : 'bg-slate-700')} />
                {s.label}
              </li>
              {i < STEPS.length - 1 && <li className="flex-1 h-px bg-slate-800" />}
            </React.Fragment>
          ))}
        </ol>

        {(call.errorHint || call.errorMessage) && (
          <div className="text-[11px] rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-rose-200 space-y-0.5">
            {call.errorCode && <div className="font-mono">Twilio error {call.errorCode}</div>}
            {call.errorHint && <div>{call.errorHint}</div>}
            {call.errorMessage && <div className="text-rose-300/80">{call.errorMessage}</div>}
          </div>
        )}

        {!call.terminal ? (
          <Button variant="danger" className="w-full" disabled={hangingUp} onClick={() => onHangup(call.callSid)}>
            <PhoneOff className="w-4 h-4" /> End call
          </Button>
        ) : (
          <p className="text-[11px] text-slate-500">
            Ended as <span className="text-slate-300 font-semibold">{call.outcomeLabel || call.outcome}</span>
            {' '}· recorded in Call History{call.turns > 1 ? ' with the transcript and AI summary' : ' (no conversation to summarize)'}.
          </p>
        )}

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Live transcript</div>
          {call.transcript?.length ? (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {call.transcript.map((m, i) => (
                <div key={i} className={cn('flex gap-3 text-xs rounded-lg px-3 py-2',
                  m.sender === 'bot' ? 'text-slate-300 bg-slate-800/50' : 'text-emerald-100 bg-emerald-900/30')}>
                  {m.sender === 'bot' ? <User className="w-3.5 h-3.5 shrink-0 mt-0.5 rotate-180" /> : <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span className="flex-1">{m.text}</span>
                  <span className="text-[10px] font-mono opacity-40">{m.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-600">Nothing captured yet — turns appear once both sides have spoken.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
