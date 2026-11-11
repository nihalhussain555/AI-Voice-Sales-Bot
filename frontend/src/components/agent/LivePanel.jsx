import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Loader2, Phone, PhoneOff, RefreshCw, Search, Users
} from 'lucide-react';

import { api } from '../../services/api.js';
import { cn } from '../../lib/cn.js';
import { useApp } from '../AppShell.jsx';
import { formatClock } from '../../lib/customers.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Button } from '../ui/button.jsx';
import { Badge, OutcomeBadge } from '../ui/badge.jsx';
import { Field, Input } from '../ui/input.jsx';
import Dialog from '../ui/dialog.jsx';
import { Table, Td, Th, THead, Tr } from '../ui/table.jsx';
import { EmptyState } from '../ui/empty-state.jsx';
import { useToast } from '../ui/toast.jsx';
import Transcript from '../Transcript.jsx';

const STEPS = [
  { key: 'queued', label: 'Dialing' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'active', label: 'Talking' }
];

// Mirrors backend normalizeE164: separators are forgiven, a country code is not
// (guessing one could dial a different country entirely).
function toE164(raw) {
  let value = String(raw || '').trim();
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (!value.startsWith('+')) return '';
  value = value.replace(/[^\d+]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(value) ? value : '';
}

function StateBadge({ call }) {
  if (call.terminal) return <OutcomeBadge outcome={call.outcome} label={call.outcomeLabel} />;
  const variant = call.state === 'active' ? 'emerald' : call.state === 'ringing' ? 'amber' : 'indigo';
  return <Badge variant={variant} dot>{STEPS.find(step => step.key === call.state)?.label || call.state}</Badge>;
}

function SetupNotice({ config }) {
  const missing = config.missing || [];
  return (
    <Card className="border-warn/35 bg-warn/10">
      <CardContent className="space-y-2 pt-5 text-xs leading-relaxed text-ink-soft">
        <p className="flex items-center gap-2 font-bold text-warn">
          <AlertTriangle className="h-4 w-4" /> Live calling is switched off
        </p>
        <p>
          Add{' '}
          {missing.length
            ? missing.map(name => <code key={name} className="mx-1 font-mono text-ink">{name}</code>)
            : 'your Twilio credentials'}{' '}
          to <code className="font-mono text-ink">backend/.env</code> and restart the backend.
        </p>
        <p className="text-ink-muted">
          Then point the number&apos;s <strong>Voice webhook</strong> to{' '}
          <code className="font-mono">{'{PUBLIC_BASE_URL}'}/api/twilio/voice</code> and the{' '}
          <strong>Status callback</strong> to <code className="font-mono">{'{PUBLIC_BASE_URL}'}/api/twilio/events</code>.
          Everything else on this page keeps working in browser-demo mode meanwhile.
        </p>
      </CardContent>
    </Card>
  );
}

function CallMonitor({ call, onHangup, hangingUp }) {
  const stepIndex = useMemo(() => {
    if (!call) return -1;
    return call.terminal ? STEPS.length : STEPS.findIndex(step => step.key === call.state);
  }, [call]);

  if (!call) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Live call</CardTitle>
            <CardDescription>Dial a number or answer an inbound ring to follow it here</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            compact
            icon={Phone}
            title="No call in progress"
            message="Attempts made from this server run appear here within about a second of dialling."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{call.to || call.from}</span>
            <StateBadge call={call} />
          </CardTitle>
          <CardDescription>
            {call.customerName || (call.direction === 'inbound' ? 'Inbound caller' : 'Prospect')}
            {call.product ? ` · ${call.product}` : ''}
          </CardDescription>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xl font-bold tabular-nums text-ink leading-none">{formatClock(call.durationSec)}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            {call.live ? 'audio streaming' : 'no media yet'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex items-center gap-1.5">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.key}>
              <li
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
                  index < stepIndex ? 'text-success' : index === stepIndex ? 'text-ink' : 'text-ink-muted/60'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    index < stepIndex ? 'bg-success' : index === stepIndex ? 'animate-pulse bg-primary' : 'bg-surface-3'
                  )}
                />
                {step.label}
              </li>
              {index < STEPS.length - 1 && <li className="h-px flex-1 bg-line" />}
            </React.Fragment>
          ))}
        </ol>

        {(call.errorHint || call.errorMessage) && (
          <div className="space-y-0.5 rounded-field border border-danger/35 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            {call.errorCode && <p className="font-mono font-semibold">Twilio error {call.errorCode}</p>}
            {call.errorHint && <p className="text-ink-soft">{call.errorHint}</p>}
            {call.errorMessage && <p className="text-ink-muted">{call.errorMessage}</p>}
          </div>
        )}

        {!call.terminal ? (
          <Button variant="danger" className="w-full" disabled={hangingUp} onClick={() => onHangup(call.callSid)}>
            <PhoneOff className="h-4 w-4" /> End call
          </Button>
        ) : (
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Ended as <span className="font-semibold text-ink-soft">{call.outcomeLabel || call.outcome}</span> ·{' '}
            {call.turns > 1
              ? 'archived in Call History with the transcript and AI summary'
              : 'archived in Call History (no conversation to summarise)'}.
          </p>
        )}

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">Live transcript</p>
          <Transcript
            turns={call.transcript || []}
            scrollable={false}
            className="max-h-64 space-y-2 overflow-y-auto pr-1"
            empty={{ title: 'Nothing captured yet', message: 'Turns appear once both sides have spoken.' }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LivePanel() {
  const { product, openProductPicker } = useApp();
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [number, setNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedSid, setSelectedSid] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    refetchInterval: (query) => (query.state.data?.calls?.some(call => !call.terminal) ? 1500 : 8000)
  });

  const { data: leadsData } = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const dialable = useMemo(() => (leadsData?.leads || []).filter(lead => lead.phone), [leadsData]);

  const calls = callsData?.calls || [];
  const active = calls.filter(call => !call.terminal);
  const selected = calls.find(call => call.callSid === selectedSid) || active[0] || calls[0] || null;

  useEffect(() => {
    if (selected && selected.callSid !== selectedSid) setSelectedSid(selected.callSid);
  }, [selected, selectedSid]);

  const refreshList = () => qc.invalidateQueries({ queryKey: ['phone-calls'] });

  const dial = useMutation({
    mutationFn: () => api.phoneDial({
      to: e164,
      productKey: product?.id,
      customerName: customerName.trim() || undefined
    }),
    onSuccess: (res) => {
      setSelectedSid(res.call.callSid);
      setNumber('');
      setCustomerName('');
      toast(`Dialing ${res.call.to}…`, 'success');
      refreshList();
    },
    onError: (error) => {
      toast(error.data?.hint ? `${error.message} — ${error.data.hint}` : error.message, 'error');
      refreshList();
    }
  });

  const hangup = useMutation({
    mutationFn: api.phoneHangup,
    onSuccess: (res) => toast(`Call ${res.call.outcomeLabel || 'ended'}`, 'info'),
    onError: (error) => toast(`Hangup failed: ${error.message}`, 'error'),
    onSettled: refreshList
  });

  const poll = useMutation({
    mutationFn: api.phoneRefresh,
    onSuccess: () => refreshList(),
    onError: (error) => toast(error.message, 'error')
  });

  const canDial = Boolean(e164 && config?.dialReady && !dial.isPending);

  return (
    <div className="space-y-4">
      {config && config.mode !== 'live' && <SetupNotice config={config} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Place a real call</CardTitle>
                <CardDescription>International format, for example +14155551234</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Customer name" hint="Optional — shown on the call record and in CRM">
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Priya Nair" />
              </Field>

              <Field
                label="Phone number"
                error={!numberLooksValid ? 'Include the country code — we never guess it.' : null}
                hint={number.trim() && numberLooksValid && e164 !== number.trim() ? `Will dial ${e164}` : null}
              >
                <Input
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canDial) dial.mutate(); }}
                  placeholder="+1 415 555 1234"
                  inputMode="tel"
                  invalid={!numberLooksValid}
                />
              </Field>

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-field border border-line bg-surface-2/60 px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <Users className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink">Dial a saved customer</span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {dialable.length ? `${dialable.length} with a phone number` : 'Import customers to fill this list'}
                  </span>
                </span>
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              </button>

              <button
                type="button"
                onClick={openProductPicker}
                className="flex w-full items-center gap-2.5 rounded-field border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <Activity className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-soft">
                  Pitching: {product?.name || 'Select product'}
                </span>
              </button>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="success"
                  className="flex-1"
                  loading={dial.isPending}
                  disabled={!canDial}
                  onClick={() => dial.mutate()}
                >
                  <Phone className="h-4 w-4" /> {dial.isPending ? 'Dialling…' : 'Call now'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => poll.mutate(selected?.callSid)}
                  disabled={!selected || poll.isPending}
                  aria-label="Refresh call status"
                >
                  <RefreshCw className={cn('h-4 w-4', poll.isPending && 'animate-spin')} />
                </Button>
              </div>

              {config && !config.aiReady && (
                <p className="text-[11px] leading-relaxed text-warn">
                  No Groq key on the server: calls connect, but the agent cannot listen or speak.
                  Set <code className="font-mono">GROQ_API_KEY</code> in <code className="font-mono">backend/.env</code>.
                </p>
              )}
              {config?.dialReady && (
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  {config.activeCalls}/{config.maxConcurrentCalls} lines busy · calls end after {config.maxCallMinutes} min.
                  Trial numbers can only dial contacts verified in the Twilio console.
                </p>
              )}
            </CardContent>
          </Card>

          <CallMonitor call={selected} onHangup={(sid) => hangup.mutate(sid)} hangingUp={hangup.isPending} />
        </div>

        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Call attempts</CardTitle>
              <CardDescription>Every dial and inbound ring tracked live for 30 minutes after it ends</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={refreshList} aria-label="Refresh attempts">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading attempts…
              </p>
            ) : calls.length === 0 ? (
              <EmptyState
                compact
                icon={Activity}
                title="No attempts this server run"
                message="Finished calls stay in Call History and in Analytics, which is where the archived records live."
              />
            ) : (
              <Table containerClassName="border-line">
                <THead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Direction</Th>
                    <Th>State</Th>
                    <Th align="right">Duration</Th>
                    <Th align="right">Turns</Th>
                  </tr>
                </THead>
                <tbody>
                  {calls.map(call => (
                    <Tr
                      key={call.callSid}
                      onClick={() => setSelectedSid(call.callSid)}
                      className={cn('cursor-pointer', selected?.callSid === call.callSid && 'bg-primary/10')}
                    >
                      <Td>
                        <p className="font-mono text-xs text-ink">{call.to || call.from}</p>
                        {call.customerName && <p className="text-[11px] text-ink-muted">{call.customerName}</p>}
                      </Td>
                      <Td><Badge variant="slate">{call.direction === 'inbound' ? 'In' : 'Out'}</Badge></Td>
                      <Td><StateBadge call={call} /></Td>
                      <Td align="right" className="font-mono tabular-nums">{formatClock(call.durationSec)}</Td>
                      <Td align="right" className="font-mono tabular-nums">{call.turns}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Dial a saved customer"
        description="Numbers come from the customers you imported or captured on earlier calls."
      >
        {dialable.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No customers with a phone number yet"
            message="Import a CSV on the Import Customers page, then come back here to dial from that list."
          />
        ) : (
          <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto">
            {dialable.map(lead => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => {
                    setNumber(lead.phone);
                    setCustomerName(lead.name === 'Unknown prospect' ? '' : lead.name);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{lead.name}</span>
                    <span className="block truncate text-[11px] text-ink-muted">{[lead.company, lead.product].filter(Boolean).join(' · ') || 'No company recorded'}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-soft">{lead.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}
