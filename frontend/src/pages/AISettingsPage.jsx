import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Bot, Copy, Check, PhoneIncoming, Database, RefreshCw, KeyRound,
  Download, FileJson, AlertTriangle
} from 'lucide-react';

import { api, exportUrls } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { HintText, Select } from '../components/ui/input.jsx';
import { LoadState } from '../components/ui/empty-state.jsx';
import { useToast } from '../components/ui/toast.jsx';
import { SUPPORTED_LANGUAGES } from '../lib/languages.js';

export default function AISettingsPage() {
  const { push: toast } = useToast();
  const { health, product } = useApp();
  const [language, setLanguage] = useState('English');
  const [copied, setCopied] = useState(false);

  const personaQuery = useQuery({
    queryKey: ['agent-persona', product?.id || 'devpulse', language],
    queryFn: () => api.agentPersona({ productKey: product?.id, language })
  });
  const phoneQuery = useQuery({ queryKey: ['phone-config'], queryFn: api.phoneConfig });
  const callsQuery = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: api.leads });

  const persona = personaQuery.data;
  const phone = phoneQuery.data;
  const keySet = health?.groqKeyConfigured;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(persona.systemPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('The browser blocked clipboard access — select the text and copy manually.', 'error');
    }
  };

  return (
    <Page className="max-w-5xl">
      <PageHeader
        description="What this build actually runs on. Everything here is read from the server at load time — settings that are not honoured by the code are not offered as inputs."
        meta={health && (
          <>
            <Badge variant={keySet ? 'success' : 'amber'} dot>
              {keySet ? 'Groq key on server' : 'No Groq key — demo engine'}
            </Badge>
            <Badge variant={phone?.mode === 'live' ? 'success' : 'slate'} dot>
              Phone line {phone?.mode === 'live' ? 'live' : 'off'}
            </Badge>
          </>
        )}
        actions={
          <Button variant="ghost" size="sm" onClick={() => { personaQuery.refetch(); phoneQuery.refetch(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader icon={Sparkles} title="AI provider" description="Model names come from the server environment." className="px-5 pt-5" />
          <CardContent className="pt-0 space-y-1">
            <Row label="Provider" value="Groq (OpenAI-compatible chat API)" />
            <Row label="Chat model" value={health?.chatModel || '—'} mono />
            <Row label="Speech to text" value={health?.voice?.sttModel || '—'} mono />
            <Row label="Text to speech" value={health?.voice?.ttsModel || '—'} mono />
            <Row label="Voice" value={health?.voice?.ttsVoice || '—'} mono />
            <Row
              label="API key"
              value={keySet ? 'Configured on the server' : 'Not configured'}
              tone={keySet ? 'success' : 'warn'}
            />
            <div className="rounded-field border border-line bg-surface-3/50 px-3.5 py-3 mt-3 flex gap-2.5">
              <KeyRound className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Keys are only ever read from <code className="text-ink-soft">backend/.env</code> by the server. They are never
                sent to this page, stored in the browser, or included in exports — which is why there is no field to paste one.
                Set <code className="text-ink-soft">GROQ_API_KEY</code> and restart to switch from the built-in engine to the LLM.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader
            icon={AlertTriangle}
            title="What runs without keys"
            description="The honest fallback, so a demo never looks like an LLM answer."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0 space-y-3 text-xs text-ink-soft leading-relaxed">
            <p>
              <span className="font-bold text-ink">No Groq key:</span> replies come from the rule-based sales engine shipped in
              the repo. It handles pricing, objection and next-step intents in all three languages, and every reply is labelled
              “Built-in demo engine” while you are on a call.
            </p>
            <p>
              <span className="font-bold text-ink">No Twilio credentials:</span> the Live phone tab stays switched off and shows
              exactly which variables are missing. Browser demo calls are unaffected.
            </p>
            <p>
              <span className="font-bold text-ink">Speech recognition:</span> handled by the browser’s own engine (Chrome and Edge
              are the most reliable). Nothing is streamed to a third party for transcription in demo mode.
            </p>
            <Link to="/agent" className="text-primary hover:text-primary-hover font-semibold inline-flex items-center gap-1">
              Open the Voice Agent console →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeader
          icon={Bot}
          title={`Agent persona · ${persona?.name || 'loading…'}`}
          description="Read-only: this is the system prompt the server generates for the selected product, byte for byte."
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                aria-label="Preview language"
                className="!py-1.5 !text-[11px] w-auto"
              >
                {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </Select>
              <Button variant="outline" size="sm" onClick={copyPrompt} disabled={!persona}>
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy prompt'}
              </Button>
            </div>
          }
          className="px-5 pt-5"
        />
        <CardContent className="pt-0">
          <LoadState isLoading={personaQuery.isLoading} error={personaQuery.error} onRetry={personaQuery.refetch} skeleton="text">
            {persona && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{persona.role}</Badge>
                  <Badge variant="slate">{persona.product}</Badge>
                  <Badge variant="violet">{persona.productKey === 'custom' ? 'custom product' : `key: ${persona.productKey}`}</Badge>
                  <Badge variant="slate">{persona.language}</Badge>
                </div>
                <pre className="rounded-card border border-line bg-surface-3/60 p-4 text-[11px] leading-relaxed text-ink-soft whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
                  {persona.systemPrompt}
                </pre>
                <HintText>
                  Generated by <code className="text-ink-soft">{persona.sourceFile}</code> · {persona.note}
                </HintText>
              </div>
            )}
          </LoadState>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <SectionHeader
            icon={PhoneIncoming}
            title="Phone line"
            description="Setup steps and dialling live on the Voice Agent page."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            <LoadState isLoading={phoneQuery.isLoading} error={phoneQuery.error} onRetry={phoneQuery.refetch} skeleton="text">
              {phone && (
                <div className="space-y-1">
                  <Row label="Mode" value={phone.mode} tone={phone.mode === 'live' ? 'success' : 'warn'} mono />
                  <Row label="Outbound dialling" value={phone.dialReady ? 'Ready' : 'Unavailable'} tone={phone.dialReady ? 'success' : 'muted'} />
                  <Row label="Inbound calls" value={phone.inboundReady ? 'Ready' : 'Unavailable'} tone={phone.inboundReady ? 'success' : 'muted'} />
                  <Row label="Sender number" value={phone.phoneNumber || '—'} mono />
                  <Row label="Max concurrent calls" value={phone.maxConcurrentCalls} />
                  <Row label="Max call minutes" value={phone.maxCallMinutes} />
                  {phone.missing?.length > 0 && (
                    <p className="text-[11px] text-warn mt-3 leading-relaxed">
                      Waiting on: {phone.missing.join(', ')}
                    </p>
                  )}
                  <Link
                    to="/agent?mode=live"
                    className="mt-3 inline-block text-xs font-semibold text-primary hover:text-primary-hover"
                  >
                    Configure and place a real call →
                  </Link>
                </div>
              )}
            </LoadState>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader
            icon={Database}
            title="Data and exports"
            description="Plain JSON files owned by the backend — no hidden database."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0 space-y-1">
            <Row label="Archived calls" value={callsQuery.data?.calls?.length ?? '—'} />
            <Row label="Customers on file" value={leadsQuery.data?.leads?.length ?? '—'} />
            <Row label="Call records" value="backend/src/data/calls.json" mono />
            <Row label="Customer records" value="backend/src/data/leads.json" mono />
            <Row label="Recordings" value="backend/src/recordings/" mono />
            <HintText className="mt-2 mb-3">
              DATA_DIR and RECORDINGS_DIR override those locations when the server runs on a hosted disk.
            </HintText>
            <div className="flex flex-wrap items-center gap-2">
              <a href={exportUrls.callsCsv} download>
                <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Calls CSV</Button>
              </a>
              <a href={exportUrls.callsJson} download>
                <Button variant="outline" size="sm"><FileJson className="w-3.5 h-3.5" /> Calls JSON</Button>
              </a>
              <a href={exportUrls.leadsCsv} download>
                <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Customers CSV</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

function Row({ label, value, mono, tone }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-line/60 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted shrink-0">{label}</span>
      <span className={`text-xs text-right min-w-0 break-words ${toneClass} ${mono ? 'font-mono' : 'font-semibold'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}
