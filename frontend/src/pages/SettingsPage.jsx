import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, PhoneCall, RefreshCw, ExternalLink, CheckCircle2 } from 'lucide-react';
import { api, getStoredKey, setStoredKey } from '../services/api.js';
import { cn } from '../lib/cn.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { useToast } from '../components/ui/toast.jsx';

export default function SettingsPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [keyInput, setKeyInput] = useState(getStoredKey());

  const { data: health, refetch } = useQuery({ queryKey: ['health'], queryFn: api.health });
  const { data: phone } = useQuery({
    queryKey: ['phone-config'],
    queryFn: () => api.phoneConfig().catch(() => null),
    retry: false
  });

  const saveKey = () => {
    setStoredKey(keyInput.trim());
    qc.invalidateQueries({ queryKey: ['health'] });
    qc.invalidateQueries({ queryKey: ['phone-config'] });
    toast(keyInput.trim() ? 'Groq key saved in this browser' : 'Groq key cleared — demo engine will be used', 'success');
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-white">Settings</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {/* Engine status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <div>
              <CardTitle>AI engine</CardTitle>
              <CardDescription>Groq powers conversation, summarization and phone audio</CardDescription>
            </div>
            <div className="ml-auto">
              {health == null ? <Badge variant="rose">Server offline</Badge>
                : health.groqKeyConfigured ? <Badge variant="emerald">Server key active</Badge>
                : getStoredKey() ? <Badge variant="indigo">Browser key set</Badge>
                : <Badge variant="amber">Demo engine</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Groq API key (stored in this browser, sent with each request)</Label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="gsk_…"
            />
            <Button onClick={saveKey}>Save</Button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Get a free key at <a className="text-indigo-400 hover:underline inline-flex items-center gap-1" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys<ExternalLink className="w-3 h-3" /></a>.
            Alternatively put <code className="text-slate-400">GROQ_API_KEY=…</code> in the server <code className="text-slate-400">.env</code> so all browsers share it
            (server key takes effect when no key is set here per-request priority applies). Current chat model: <span className="text-slate-400">{health?.chatModel || '—'}</span>.
          </p>
        </CardContent>
      </Card>

      {/* Telephony */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <PhoneCall className="w-4 h-4 text-emerald-400" />
            <div>
              <CardTitle>Phone calling (Twilio)</CardTitle>
              <CardDescription>Real calls routed through Groq STT → LLM → TTS</CardDescription>
            </div>
            <div className="ml-auto">
              {phone == null ? <Badge variant="slate">Server offline</Badge>
                : phone.mode === 'live' ? <Badge variant="emerald">Live mode</Badge>
                : phone.inboundReady ? <Badge variant="amber">Inbound only</Badge>
                : <Badge variant="amber">Demo only</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {phone?.mode === 'live' ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Row label="Number" value={phone.phoneNumber} ok />
                <Row label="Groq key on server" value={phone.aiReady ? 'configured' : 'missing'} ok={phone.aiReady} />
                <Row label="Inbound" value={phone.inboundReady ? 'accepting calls' : 'needs credentials'} ok={phone.inboundReady} />
                <Row label="Signature validation" value={phone.signatureValidation ? 'on' : 'off'} ok={phone.signatureValidation} />
                <Row label="Concurrent lines" value={String(phone.maxConcurrentCalls)} ok />
                <Row label="Max call length" value={`${phone.maxCallMinutes} min`} ok />
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <p className="font-mono text-slate-300 break-all">Voice webhook → {phone.webhookUrl}</p>
                <p className="font-mono text-slate-300 break-all">Status callback → {phone.eventsUrl}</p>
              </div>
              <Link to="/phone">
                <Button variant="success" size="sm"><PhoneCall className="w-4 h-4" /> Open live calling</Button>
              </Link>
            </>
          ) : (
            <div className="text-xs text-slate-400 leading-relaxed space-y-2">
              <p>Add these to <code className="text-slate-300">backend/.env</code> and restart the server{phone?.missing?.length ? <> — currently missing <code className="text-amber-300">{phone.missing.join(', ')}</code></> : ''}:</p>
              <pre className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 overflow-x-auto">{`TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_PHONE_NUMBER=+1…
PUBLIC_BASE_URL=https://<your-public-https-host>`}</pre>
              <p>Then in the Twilio console set the number&apos;s <strong>Voice webhook</strong> to
                <code className="text-slate-300"> {'{PUBLIC_BASE_URL}'}/api/twilio/voice</code> and the <strong>Status Callback</strong> to
                <code className="text-slate-300"> {'{PUBLIC_BASE_URL}'}/api/twilio/events</code>.
                Run the backend through ngrok (<code className="text-slate-300">ngrok http 3001</code>) or deploy it so Twilio can reach it.</p>
              <p>Trial accounts can only dial phone numbers verified in the Twilio console, and inbound calls from arbitrary
                numbers need a live (paid) number.</p>
              <p className="text-amber-400/90">Groq&apos;s phone TTS voice is English-only; Hindi/Telugu calls respond with English audio on the phone channel (browser calls keep native multilingual voice).</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader><CardTitle>About</CardTitle></CardHeader>
        <CardContent className="text-xs text-slate-400 leading-relaxed space-y-1">
          <p>VoicePitch AI{health?.version ? ` v${health.version}` : ''} — demo voice calls in the browser (Web Speech API) and real phone calls through Twilio, with live transcripts, AI summaries, analytics and a lead CRM.</p>
          <p>Browser recording captures your microphone channel; the bot voice is synthesized locally via TTS.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800/60 rounded-xl px-3 py-2">
      <CheckCircle2 className={cn('w-3.5 h-3.5 shrink-0', ok ? 'text-emerald-400' : 'text-amber-400')} />
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</span>
      <span className="ml-auto text-xs text-slate-200 font-semibold truncate">{value}</span>
    </div>
  );
}
