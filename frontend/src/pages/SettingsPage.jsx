import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, PhoneCall, RefreshCw, ExternalLink, CheckCircle2 } from 'lucide-react';
import { api, getStoredKey, setStoredKey } from '../services/api.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { useToast } from '../components/ui/toast.jsx';

export default function SettingsPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [keyInput, setKeyInput] = useState(getStoredKey());
  const [phone, setPhone] = useState('');

  const { data: health, refetch } = useQuery({ queryKey: ['health'], queryFn: api.health });
  const { data: twilioRaw } = useQuery({
    queryKey: ['twilio-status'],
    // 404/501 on an unreachable endpoint is expected in demo mode, not an error.
    queryFn: () => api.twilioStatus().catch(() => ({ unreachable: true })),
    retry: false
  });
  const twilioState = !twilioRaw ? 'checking'
    : twilioRaw.unreachable ? 'offline'
    : twilioRaw.configured ? 'live'
    : 'off';

  const callOut = useMutation({
    mutationFn: api.twilioCall,
    onSuccess: (d) => toast(`Dialing ${d.to} from ${d.from}… check your phone.`, 'success'),
    onError: (e) => toast(`Call failed: ${e.message}`, 'error')
  });

  const saveKey = () => {
    setStoredKey(keyInput.trim());
    qc.invalidateQueries({ queryKey: ['health'] });
    qc.invalidateQueries({ queryKey: ['twilio-status'] });
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
              <CardTitle>Phone telephony (Twilio)</CardTitle>
              <CardDescription>Real inbound calls routed through Groq STT → LLM → TTS</CardDescription>
            </div>
            <div className="ml-auto">
              {twilioState === 'live' ? <Badge variant="emerald">Live</Badge>
                : twilioState === 'off' ? <Badge variant="amber">Keys missing</Badge>
                : twilioState === 'offline' ? <Badge variant="slate">Server offline</Badge>
                : <Badge variant="amber">Checking…</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {twilioState !== 'live' ? (
            <div className="text-xs text-slate-400 leading-relaxed space-y-2">
              <p>To enable real phone calls, add these to <code className="text-slate-300">.env</code> and restart the server:</p>
              <pre className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 overflow-x-auto">{`TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_PHONE_NUMBER=+1…
PUBLIC_BASE_URL=https://<your-ngrok>.ngrok-free.io`}</pre>
              <p>Then point your Twilio number's <strong>Voice webhook</strong> to
                <code className="text-slate-300"> {`{PUBLIC_BASE_URL}/api/twilio/voice`}</code>.
                Run the server through ngrok (<code className="text-slate-300">ngrok http 3001</code>) so Twilio can reach it.</p>
              <p className="text-amber-400/90">Note: Groq's phone TTS voice is English-only; Hindi/Telugu calls respond with English audio on the phone channel (browser calls keep native multilingual voice).</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Number: <span className="font-mono text-slate-200">{twilioRaw.phoneNumber || '—'}</span>
                </span>
                <span className="text-slate-500">Webhook: <code className="text-slate-300">{twilioRaw.webhookHint || 'set PUBLIC_BASE_URL'}</code></span>
              </div>
              <div className="flex gap-2">
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567 — your mobile for a test call" />
                <Button variant="success" disabled={!phone.trim() || callOut.isPending} onClick={() => callOut.mutate(phone.trim())}>
                  <PhoneCall className="w-4 h-4" /> Call me
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader><CardTitle>About</CardTitle></CardHeader>
        <CardContent className="text-xs text-slate-400 leading-relaxed space-y-1">
          <p>VoicePitch AI{health?.version ? ` v${health.version}` : ''} — browser voice calls via the Web Speech API, live transcripts, AI summaries, analytics, lead CRM and optional phone telephony.</p>
          <p>Browser recording captures your microphone channel; the bot voice is synthesized locally via TTS.</p>
        </CardContent>
      </Card>
    </div>
  );
}
