# 🎙️ VoicePitch AI — Autonomous SaaS Voice Sales Agent

An AI voice sales agent that sells **any SaaS product** through natural voice conversations — in the browser **or over the phone**. Powered by [Groq](https://console.groq.com) for fast LLM replies, speech-to-text, and text-to-speech. Includes live transcripts, call recording, AI summaries with sales-status classification, an analytics dashboard, and a lightweight lead CRM with CSV export.

The repository is split into two independently deployable apps:

```
.
├── frontend/    React 18 + Vite SPA  →  Vercel / Netlify
├── backend/     Node.js + Express API →  Render
└── package.json root orchestration scripts
```

> **v2.1** restructured the single-folder project into this split architecture.
> **v2.0** migrated off retired Gemini/`gpt-4o-mini` models to Groq, rebuilt the UI
> as a routed React app, fixed the "bot stops listening mid-call" bug, and added
> analytics, CRM and optional Twilio telephony.

---

## 🌟 Features

| Area | Detail |
| :--- | :--- |
| **Voice conversation** | Speaks via Web Speech TTS, listens via Web Speech STT with **auto-restart**, **barge-in** (interrupt the bot), and trailing-silence turn detection. |
| **AI engine (Groq)** | Chat: `llama-3.3-70b-versatile`. Phone STT: `whisper-large-v3-turbo`. Phone TTS: `canopylabs/orpheus-v1-english`. |
| **Zero-key demo mode** | Works with no API key using a built-in consultative rule engine. **When a Groq key is set, replies are real LLM output** — and if the LLM call fails you now see an explicit error instead of a silent fallback. |
| **Multilingual** | English, Hindi, Telugu, Malayalam, Tamil and Arabic for browser calls — the list lives in `frontend/src/lib/languages.js`, replies and scripts in `backend/src/services/salesEngine.js`. Spoken output uses the operating-system voice installed for that locale, so an unseen language falls back to the default voice while text and replies stay in the chosen language. Phone channel TTS is English-only (Groq Orpheus limitation). |
| **Live transcript** | Real-time bubbles with timestamps, interim speech preview, quick-reply prompts, and a typed-input fallback that works without a microphone. |
| **Recording & consent** | Consent modal, microphone capture via MediaRecorder, uploaded to the backend and playable per call. |
| **AI summary** | Overview, requirements, objections, next steps, sentiment, and 0–100 deal score. |
| **Sales status** | Converted / Interested / Follow-up Required / Not Interested / Demo Requested / No Response. |
| **Analytics dashboard** | KPI cards, conversion funnel, time-series trends, and breakdowns by product, language, channel, call outcome and direction. |
| **Lead CRM** | Auto-extracts prospect name/company/email/phone/intent from each call, pipeline stages, notes, and CSV/JSON export. |
| **Demo vs live modes** | `/agent` has two tabs: **Browser demo** (voice, no credentials needed) and **Live phone** (real telephony). Old `/call` and `/phone` URLs redirect to them. Both feed the same history, analytics and CRM. |
| **Phone telephony (Twilio)** | Inbound + outbound calls over Media Streams → Groq STT/LLM/TTS on the API port, with barge-in, per-attempt outcome tracking (busy / no-answer / rejected / failed / canceled), concurrency cap and a lost-callback watchdog. |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18.18+
- **Chrome / Edge / Brave** (Web Speech API) with microphone access for voice calls.

### Install both apps

```bash
npm run setup        # installs root (concurrently) + backend/ + frontend/ deps
```

(or separately: `npm install --prefix backend && npm install --prefix frontend`)

### Development — two servers, proxied

```bash
npm run dev          # backend :3001 + Vite :5173, /api and /recordings proxied
```

Open **http://localhost:5173**. No `VITE_API_BASE_URL` is needed in dev; the Vite
proxy keeps requests same-origin.

Individual servers: `npm run dev:backend` · `npm run dev:frontend`

### Production — single port locally

```bash
npm run build        # frontend → frontend/dist
npm start            # backend serves frontend/dist + API on :3001
```

Open **http://localhost:3001**. The backend auto-detects `../frontend/dist`; on a
split deployment that folder simply isn't there and the API stops serving HTML.

### Tests

```bash
npm test             # backend suite: audio/VAD + Twilio-shaped phone fixtures
```

---

## ⚙️ Configuration

Environment lives in **two independent files** — copy each example, and never
commit secrets (they belong to the backend only):

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

### `backend/.env`

| Variable | Purpose |
| :--- | :--- |
| `GROQ_API_KEY` | **Enables real AI.** Free key at https://console.groq.com/keys. Without it the app runs in zero-key demo mode. |
| `PORT` | API port (default `3001`). |
| `GROQ_{CHAT,STT,TTS}_MODEL`, `GROQ_TTS_VOICE` | Optional model overrides. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Enable inbound phone calls. Leave blank to disable the phone feature. |
| `TWILIO_PHONE_NUMBER` | Your Twilio number — the caller ID for outbound dialing and the line inbound calls ring. |
| `PUBLIC_BASE_URL` | Public HTTPS URL of the API (e.g. ngrok or Render) so Twilio webhooks and the audio websocket can reach it. Required for outbound dialing. |
| `TWILIO_VALIDATE` | Set `false` only for local TwiML testing without signature validation. Default `true`. |
| `TWILIO_STATUS_CALLBACK` | Ask Twilio for call progress callbacks (`busy`, `no-answer`, `canceled`, …). Default `true`. |
| `TWILIO_MAX_CONCURRENT_CALLS` | Parallel call cap; extra callers hear "all agents are busy". Default `3`. |
| `MAX_CALL_MINUTES` | Hard cap per phone call (Groq usage guardrail, default 15). |
| `CORS_ORIGIN` | Allowed frontend origin. `*` locally; set the deployed URL in production. |
| `BODY_LIMIT` | Max request body (recordings are posted here), default `50mb`. |
| `SERVE_FRONTEND` | Serve `../frontend/dist` from the API port. Default `true`, auto-off when absent. |
| `DATA_DIR` / `RECORDINGS_DIR` | Relocate the JSON store and audio to a persistent disk. |

All env reading lives in `backend/src/config/env.js`; no other module reads
`process.env` directly except that file.

### `frontend/.env`

| Variable | Purpose |
| :--- | :--- |
| `VITE_API_BASE_URL` | Backend origin. **Empty in dev/local**; set to e.g. `https://voicepitch-api.onrender.com` when the SPA is hosted separately. Inlined at build time. |
| `VITE_PROXY_TARGET` | Dev-server proxy target if the API isn't on `localhost:3001`. |

**The Groq key is server-only.** `GROQ_API_KEY` in `backend/.env` is read by the
API process and never travels to the browser: no request body carries a key, none
is written to `localStorage`, and none appears in exports. **AI Settings** reads
`GET /api/health` to show which provider, models and telephony mode are actually
live, and there is deliberately no field to paste a key.

---

## 🧱 Architecture

### frontend/

```
frontend/
├── index.html                     # SPA entry (Vite)
├── vite.config.js                 # dev proxy for /api and /recordings
├── tailwind.config.js             # brand palette + animations
├── postcss.config.js
├── vercel.json / netlify.toml     # SPA rewrites for each host
├── .env.example
└── src/
    ├── main.jsx                   # React root (no StrictMode: it breaks the speech lifecycle)
    ├── App.jsx                    # Router + React Query + theme + toast providers
    ├── pages/                     # Overview, AgentPage (browser demo + live Twilio tabs),
    │                              # Customers, Import, History, Analytics,
    │                              # AISettings, Profile, Help
    ├── components/
    │   ├── AppShell.jsx           # Rail + top bar layout, product/health context
    │   ├── shell/                 # Sidebar, Topbar, GlobalSearch, NotificationsBell, ProfileMenu, Page
    │   ├── agent/                 # DemoPanel, LivePanel, CallSummaryDialog
    │   ├── Transcript.jsx         # One transcript view shared by live call and history
    │   ├── AudioVisualizer.jsx    # Canvas waveform (real mic spectrum while listening)
    │   ├── ProductPicker.jsx      # Catalog + custom SaaS product dialog
    │   └── ui/                    # button, card, badge, dialog, input, table, tabs,
    │                              # toast, tooltip, toggle, avatar, skeleton, stat-card,
    │                              # progress, empty-state, page-header
    ├── context/theme.jsx          # Design tokens: dark/light, useThemeTokens() for charts
    ├── hooks/useCallSession.js    # Call state machine: turns, recording, summary, lead extract
    ├── services/                  # api.js (all HTTP), speechService.js (Web Speech), audioRecorder.js
    ├── lib/                       # nav.js (one nav list), languages.js (the supported languages
    │                              # + their speech locales), customers.js (identity + CRM merge),
    │                              # notifications.js (bell feed), profile.js (device prefs), cn.js
    └── styles/index.css           # Token variables for both themes + Tailwind layers
```

There is deliberately no `src/assets/` yet: the favicon is an inline SVG data URI in
`index.html` and fonts load from Google, so the first real image or font file should
go in `frontend/src/assets/` (imported, hashed) or `frontend/public/` (served as-is).

`services/api.js` is the only place that knows the backend origin: every path is
prefixed with `apiUrl()` and stored recording paths are resolved with
`resolveAsset()`, so audio still plays when the SPA and API are on different hosts.

### backend/

```
backend/
├── package.json                   # start / dev / test
├── render.yaml                    # Render blueprint (rootDir: backend)
├── .env.example
└── src/
    ├── server.js                  # entrypoint: telephony → app → listen → websocket
    ├── app.js                     # Express assembly: CORS, body parsers, routes, static, errors
    ├── config/env.js              # all env vars + filesystem paths, loads backend/.env
    ├── routes/                    # health, catalog, chat, summarize, calls, analytics, leads, export, recordings + index
    ├── controllers/               # one handler file per route group
    ├── middleware/
    │   ├── upload.js              # multer disk storage for recordings
    │   └── error-handler.js       # JSON 404 + status-mapped error handler
    ├── models/
    │   ├── db.js                  # call store (JSON file) + seed data
    │   └── leads.js               # lead store, transcript extraction, CSV builders
    ├── services/
    │   ├── groqClient.js          # every Groq call: chat, STT, TTS, key resolution, timeouts
    │   ├── salesEngine.js         # SaaS catalog, system prompt, zero-key rule engine
    │   ├── salesTurn.js           # next-turn logic shared by HTTP and phone
    │   ├── summarizer.js          # AI summary + sales-status classification
    │   ├── analytics.js           # dashboard aggregation
    │   ├── twilioClient.js        # the ONLY module that calls the Twilio SDK (test seam)
    │   ├── callLifecycle.js       # one attempt per call: state, terminal outcome, persist once
    │   ├── phoneService.js        # app-facing dial/hangup/refresh/capacity
    │   └── telephony.js           # Twilio-facing webhooks + Media Streams: VAD → STT → turn → TTS → barge-in
    ├── utils/
    │   ├── audioCodecs.js         # μ-law ↔ PCM, WAV parse/build, resampling, RMS
    │   └── phone.js               # E.164 input, Twilio status → outcome taxonomy, error hints
    ├── data/                      # calls.json, leads.json (created on first boot)
    ├── recordings/                # uploaded call audio
    └── tests/
        ├── telephony.test.js      # codec + VAD + unconfigured-telephony unit tests
        └── phone.test.js          # fixtures: webhooks, callbacks, dialling, live media stream
```

### API surface

`GET /api/health` · `GET /api/products` · `POST /api/chat` · `POST /api/summarize` ·
`GET/POST/DELETE /api/calls` · `POST /api/upload-recording` · `GET /api/analytics` ·
`GET/POST/PATCH/DELETE /api/leads` · `POST /api/leads/extract` ·
`GET /api/export/{calls.csv,calls.json,leads.csv}` ·
`GET /api/phone/config` · `POST /api/phone/dial` · `GET /api/phone/calls[?active=1]` ·
`GET /api/phone/calls/:sid` · `POST /api/phone/calls/:sid/{refresh,hangup}` ·
`POST /api/twilio/voice` (Twilio webhook) · `POST /api/twilio/events` (status callback) ·
`GET /api/twilio/status` · `WS /ws/media` (phone audio).

---

## 📞 Real phone calling (Twilio)

Two separate modes, on purpose:

| | Demo — `/agent` (Browser demo tab) | Live — `/agent?mode=live` (Live phone tab) |
| :--- | :--- | :--- |
| Audio | your browser mic + OS speech | the public switched telephone network |
| Needs | nothing | Twilio number + `GROQ_API_KEY` |
| Transcript | browser Web Speech API | Groq Whisper (STT) → agent → Groq TTS |
| Saved as | `channel: browser` | `channel: phone`, with `direction`, `callSid`, `outcome` |

The demo path never touches Twilio, so it keeps working with no credentials.
`GET /api/phone/config` reports which mode the server is actually in.

### Flip-to-live checklist

1. **Create the Twilio account** — console.twilio.com → the dashboard shows a
   `Account SID` and an `API key/secret`. Use **Copy Auth Token** (the API-key
   secret also works as `TWILIO_AUTH_TOKEN`).
2. **Buy a number** — Phone Numbers → Manage → Buy a number. A trial number can
   receive calls but can only *dial* numbers you have verified.
3. **Fill in `backend/.env`** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER` (E.164) and `PUBLIC_BASE_URL`. Restart; the startup log
   must print `phone: LIVE calling on <number>`.
4. **Expose the API over HTTPS** — Twilio cannot reach `localhost`.
   Local: `ngrok http 3001` → put the `https://….ngrok-free.app` URL in
   `PUBLIC_BASE_URL` and restart (the URL changes per session, so webhooks and
   signature validation both follow it). Deployed: `PUBLIC_BASE_URL` is the
   service URL, e.g. `https://voicepitch-api.onrender.com`.
5. **Set the voice webhook** — the number's *Voice* section → "A call comes in" →
   Webhook → `POST {PUBLIC_BASE_URL}/api/twilio/voice`.
6. **Set the status callback** — same page → "A call ends" / Status Callback →
   `POST {PUBLIC_BASE_URL}/api/twilio/events`. Outbound dials already attach it
   per-call (`StatusCallback`), but this is what makes inbound legs report
   busy / no-answer / canceled.
7. **Trial: verify a number** — Console → Phone Numbers → Verified Numbers →
   create a verification for your own mobile. Dialing anything else on a trial
   account fails with Twilio error **21219**, which the UI names for you.
8. **Test inbound** — call the Twilio number from your verified phone. The agent
   greets you, listens, answers, and you can interrupt it (barge-in).
9. **Test outbound** — open **Phone Call** in the sidebar, type the number in
   international format and press *Call now*. Watch the stepper go
   *Dialing → Ringing → Talking*, then hang up.

`GET /api/health` and **Settings → Phone calling** show the same readiness data
(missing variables, webhook URLs, live call count), so step 3 is verifiable
without making a call.

### What happens when a call does not connect

Every attempt — answered or not — is written to Call History exactly once with a
terminal `outcome`. The reason comes from whichever signal arrives first
(`<Connect>` action, status callback, websocket close) plus a watchdog for
callbacks that never come:

| Outcome | Twilio source | Meaning / what to do |
| :--- | :--- | :--- |
| `completed` | `CallStatus=completed` | the leg finished; transcript and summary archived |
| `busy` | `ConnectStatus=busy` | number engaged — retry later |
| `no-answer` | `ConnectStatus=no-answer` | rang out — retry at another time |
| `canceled` | `CallStatus=canceled` | we hung up before answer (app *End call*) |
| `rejected` | `ConnectStatus=rejected` | caller/screen rejected the call |
| `not-callable` | `CallStatus=not-callable` | number cannot receive SMS/voice — check the digits |
| `failed` | `CallStatus=failed` + `ErrorCode` | Twilio refused it — the error code and a plain-English hint are stored (e.g. 21219 = unverified trial number, 11200 = webhook unreachable) |
| `unknown` | watchdog after `MAX_CALL_MINUTES` + 2 min | no terminal signal arrived; treat as needs-a-look |

Unanswered attempts archive with sales status `No Response`; the real reason
lives in `outcome` / `outcomeLabel`, which the History table and Analytics
"By call outcome" panel show.

> **Status of this code:** the live path is verified against Twilio-shaped
> fixtures — real HTTP webhook/callback requests, a Twilio SDK double and a
> scripted Media Streams client in `backend/src/tests/phone.test.js` — but no
> call has been placed through a real Twilio account yet, because this checkout
> has no credentials. Until then, treat items above as *implemented and
> fixture-tested*, not *field-proven*.

---

## 📦 Deployment

The two apps deploy independently. Only the frontend talks to the browser;
the backend never needs to know the SPA's address except for CORS.

### Backend → Render

Using `backend/render.yaml` (New Blueprint at the repo root) or manually:

| Setting | Value |
| :--- | :--- |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Environment | `GROQ_API_KEY`, `CORS_ORIGIN=https://<frontend-host>`, `NODE_ENV=production`, optional `TWILIO_*` + `PUBLIC_BASE_URL` |

> **Data durability note:** the JSON store and recordings live on Render's
> free filesystem, which is wiped on every deploy/restart (the seed data is
> recreated automatically). Attach a persistent disk and set `DATA_DIR` /
> `RECORDINGS_DIR` if you need real call history, or move `models/db.js` and
> `models/leads.js` to Postgres/Mongo — they are the only two files that touch disk.

### Frontend → Vercel

Import the repo, set **Root Directory = `frontend`**; `vercel.json` supplies the
build command, output dir and SPA rewrite. Add `VITE_API_BASE_URL` (the Render
URL) in Project Settings → Environment Variables, then redeploy so Vite inlines it.

### Frontend → Netlify

Set **base directory = `frontend`**, publish dir `dist` (see `netlify.toml`),
and define the same `VITE_API_BASE_URL` build-time variable.

### Verification checklist after deploying

```bash
curl https://<api-host>/api/health          # provider, model, key + twilio flags
curl -X POST https://<api-host>/api/chat -H 'Content-Type: application/json' \
     -d '{"message":"pricing?","productKey":"devpulse","language":"English"}'
curl https://<api-host>/api/export/calls.csv
```
Then open the frontend URL: the header health badge should read the same engine
as `/api/health`, and a browser console CORS error means `CORS_ORIGIN` still
needs the deployed frontend origin.

---

## 🧪 Testing notes

- `npm test` runs the backend suite (30 tests, ~11s, no network): μ-law round trips, WAV parse/build,
  resampling, chunk pacing, energy VAD segmentation, the 501 behavior of an
  unconfigured telephony stack, and `tests/phone.test.js`, which drives the real
  Express routes with Twilio-shaped fixtures — webhook and status-callback form
  posts, a Twilio SDK double behind `setTwilioClientFactory()`, stubbed
  STT/TTS/turn providers, and a scripted `ws` Media Streams client that sends
  `connected`/`start`/`media`/`stop` frames. It asserts the outcomes
  (busy, no-answer, canceled, rejected, not-callable, failed, watchdog), the
  once-only history row, socket↔call binding via `<Parameter>`, the spoken
  greeting reaching the transcript, barge-in stopping playback, and the
  analytics roll-up of phone attempts by outcome and direction.
- No test contacts Twilio or Groq, and **no test proves a real call connects** —
  that needs credentials and a number (see the flip-to-live checklist above).
- The browser voice path depends on a physical microphone and OS speech
  synthesis, so it can't be fully automated. Smoke-test it manually:
  1. Start a call and let the greeting finish.
  2. **Stay silent ~5s**, then keep talking — the bot must still be listening
     (this is the regression v1 had).
  3. Interrupt the bot mid-sentence — playback should stop and pick up your words.
  4. Use the typed-input box and end the call; check summary, recording playback,
     history persistence, auto-extracted lead, and the analytics page.
