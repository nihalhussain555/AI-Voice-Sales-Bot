import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Rocket, Keyboard, Wrench, Terminal, Link2, Check, X, Copy, CheckCheck,
  Mic, PhoneCall, Sparkles, FileSpreadsheet
} from 'lucide-react';

import { useApp } from '../components/AppShell.jsx';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { HintText } from '../components/ui/input.jsx';
import { useToast } from '../components/ui/toast.jsx';

const STEPS = [
  {
    icon: Sparkles,
    title: 'Check the backend',
    body: 'The footer of this console says whether the API is reachable. If it is not, run the commands in the Setup section below — every page reads live data, so an offline server shows empty lists rather than sample numbers.'
  },
  {
    icon: FileSpreadsheet,
    title: 'Load customers',
    body: 'Import a CSV on the Import page, or add people one by one on the Customers page. The import analyses the file on the server first, so the preview shows exactly what will be written.'
  },
  {
    icon: Mic,
    title: 'Place a demo call',
    body: 'The Voice Agent page uses your browser’s microphone and speech recognition, records the call audio to the backend, and produces a summary, score and outcome when it ends.'
  },
  {
    icon: PhoneCall,
    title: 'Dial for real (optional)',
    body: 'Only possible once Twilio credentials and a public HTTPS URL are configured. The Live phone tab tells you which variables it is still waiting for, and nothing is dialled unless you press dial.'
  }
];

const NO_KEYS = [
  'Chat replies, summaries and deal scores from the built-in sales engine',
  'Browser demo calls with live transcript, recording and post-call summary',
  'Customer records, CSV import, call history and all analytics',
  'CSV and JSON exports of every stored record'
];

const NEEDS_KEYS = [
  'Groq LLM replies instead of the rule engine — GROQ_API_KEY',
  'Server-side speech-to-text and text-to-speech on phone calls — same key',
  'Real outbound and inbound telephony — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER',
  'Twilio reaching your server for those calls — PUBLIC_BASE_URL (a tunnel such as ngrok locally)'
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], note: 'Focus global search (Cmd on macOS) — searches calls, customers and products' },
  { keys: ['Enter'], note: 'Open the first search result' },
  { keys: ['Esc'], note: 'Close search, dialogs and menus' }
];

const TROUBLESHOOTING = [
  {
    symptom: 'Footer says “Waiting for backend”',
    fix: 'Start the API with npm run dev at the repo root, or npm run dev:backend on its own. The health check is http://localhost:3001/api/health.'
  },
  {
    symptom: 'Mic button does nothing or stays silent',
    fix: 'Grant microphone permission for this origin, and use Chrome or Edge — the browser speech recognition this demo relies on is not available in all browsers.'
  },
  {
    symptom: 'Replies are labelled “Built-in demo engine”',
    fix: 'That is the rule-based engine and it is expected without a Groq key. Add GROQ_API_KEY to backend/.env and restart the server to switch to the LLM.'
  },
  {
    symptom: 'Live phone tab is switched off',
    fix: 'The tab lists the exact variables still missing. Outbound dialing also needs PUBLIC_BASE_URL, because Twilio has to call your webhooks from the internet.'
  },
  {
    symptom: 'Import rejects the file with a 422',
    fix: 'The error carries the columns the server actually found. Download the template on the Import page, or rename your headers to name, company, email, phone, product.'
  },
  {
    symptom: 'A phone call is stored as failed, code 21219',
    fix: 'Twilio trial accounts only dial numbers you have verified. Verify the destination number, or move the account to live mode.'
  },
  {
    symptom: 'A phone call is stored as failed, code 11200',
    fix: 'Twilio could not reach your webhook. A tunnel URL changes every session, so put the current one in PUBLIC_BASE_URL, restart, and point the number’s Voice webhook at {PUBLIC_BASE_URL}/api/twilio/voice.'
  }
];

const COMMANDS = [
  { cmd: 'npm run setup', note: 'install root, backend and frontend dependencies' },
  { cmd: 'npm run dev', note: 'API on :3001 and Vite on :5173 together' },
  { cmd: 'npm test', note: 'backend test suite, fixture-driven, no network' },
  { cmd: 'npm run build', note: 'production frontend into frontend/dist' },
  { cmd: 'npm start', note: 'serve API and built frontend from one port' }
];

const LINKS = [
  { label: 'Groq console — API keys and model list', href: 'https://console.groq.com/keys' },
  { label: 'Twilio console — numbers, credentials, webhooks', href: 'https://www.twilio.com/console' },
  { label: 'Web Speech API — the browser engine demo calls use', href: 'https://developer.mozilla.org/docs/Web/API/Web_Speech_API' }
];

export default function HelpPage() {
  const { push: toast } = useToast();
  const { health } = useApp();
  const [copied, setCopied] = useState(null);

  const copyCommand = async (cmd) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast('The browser blocked clipboard access — select the command and copy it manually.', 'error');
    }
  };

  return (
    <Page className="max-w-5xl">
      <PageHeader
        description="How VoicePitch AI is meant to be run, what works out of the box, and what to check when something looks broken. Nothing here is invented — every claim below is the behaviour of this build."
        meta={health && (
          <>
            <Badge variant={health.ok ? 'success' : 'danger'} dot>{health.ok ? 'API reachable' : 'API unreachable'}</Badge>
            <Badge variant={health.groqKeyConfigured ? 'success' : 'slate'}>
              {health.groqKeyConfigured ? 'Groq LLM active' : 'Built-in engine active'}
            </Badge>
          </>
        )}
        actions={
          <Link to="/ai-settings">
            <Button variant="ghost" size="sm">
              <Sparkles className="w-3.5 h-3.5" /> Provider and model details
            </Button>
          </Link>
        }
      />

      <Card>
        <SectionHeader
          icon={Rocket}
          title="Getting started"
          description="Four steps, in the order the data needs to exist."
          className="px-5 pt-5"
        />
        <CardContent className="pt-0">
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-3/70 text-[11px] font-bold text-ink">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-bold text-ink">
                    <step.icon className="w-3.5 h-3.5 text-ink-muted" />
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted max-w-3xl">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <SectionHeader
            icon={Check}
            title="Works with no keys at all"
            description="Clone, npm run dev, and every one of these is live."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {NO_KEYS.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader
            icon={X}
            title="Needs credentials in backend/.env"
            description="Copy backend/.env.example and fill in what you have."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {NEEDS_KEYS.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <X className="mt-0.5 w-3.5 h-3.5 shrink-0 text-warn" />
                  {item}
                </li>
              ))}
            </ul>
            <HintText className="mt-3">
              Keys are read by the server only. They are never sent to this page, so there is no
              settings field for pasting one.
            </HintText>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader icon={Keyboard} title="Keyboard" className="px-5 pt-5" />
          <CardContent className="pt-0 space-y-2">
            {SHORTCUTS.map((item) => (
              <div key={item.note} className="flex items-start gap-3">
                <span className="flex shrink-0 gap-1">
                  {item.keys.map(key => (
                    <kbd
                      key={key}
                      className="rounded border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-soft"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
                <p className="text-[11px] leading-relaxed text-ink-muted">{item.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <SectionHeader icon={Terminal} title="Setup commands" description="Run these from the repository root." className="px-5 pt-5" />
          <CardContent className="pt-0 space-y-1.5">
            {COMMANDS.map(({ cmd, note }) => (
              <div key={cmd} className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-field border border-line bg-surface-3/60 px-3 py-2 font-mono text-[11px] text-ink">
                  {cmd}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Copy ${cmd}`}
                  onClick={() => copyCommand(cmd)}
                >
                  {copied === cmd
                    ? <CheckCheck className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))}
            <HintText className="pt-1">
              Dev server: http://localhost:5173 · API: http://localhost:3001 (Vite proxies /api and
              /recordings, so no CORS setup is needed locally).
            </HintText>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeader
          icon={Wrench}
          title="When something looks wrong"
          description="Each symptom below has been seen in this build; the fix is what actually resolves it."
          className="px-5 pt-5"
        />
        <CardContent className="pt-0">
          <div className="divide-y divide-line/70">
            {TROUBLESHOOTING.map(({ symptom, fix }) => (
              <div key={symptom} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
                <p className="text-xs font-bold text-ink">{symptom}</p>
                <p className="text-[11px] leading-relaxed text-ink-muted">{fix}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <SectionHeader
          icon={Link2}
          title="Outside this app"
          description="The only places a key or a number can be created."
          className="px-5 pt-5"
        />
        <CardContent className="pt-0 space-y-2">
          {LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-field border border-line bg-surface-3/40 px-3.5 py-2.5 text-xs font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              {label}
              <span className="font-mono text-[10px] text-ink-muted">open ↗</span>
            </a>
          ))}
          <HintText className="pt-1">
            Everything this console stores about calls and customers is on the backend, and its
            exact locations are listed on the AI Settings page.
          </HintText>
        </CardContent>
      </Card>
    </Page>
  );
}
