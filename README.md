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
| **Multilingual** | English, Hindi, Telugu for browser calls (native TTS voices). Phone channel TTS is English-only (Groq Orpheus limitation). |
| **Live transcript** | Real-time bubbles with timestamps, interim speech preview, quick-reply prompts, and a typed-input fallback that works without a microphone. |
| **Recording & consent** | Consent modal, microphone capture via MediaRecorder, uploaded to the backend and playable per call. |
| **AI summary** | Overview, requirements, objections, next steps, sentiment, and 0–100 deal score. |
| **Sales status** | Converted / Interested / Follow-up Required / Not Interested / Demo Requested / No Response. |
| **Analytics dashboard** | KPI cards, conversion funnel, time-series trends, and breakdowns by product, language, and channel. |
| **Lead CRM** | Auto-extracts prospect name/company/email/phone/intent from each call, pipeline stages, notes, and CSV/JSON export. |
| **Phone telephony (optional)** | Real inbound & outbound calls via Twilio Media Streams → Groq STT/LLM/TTS pipeline over a websocket on the API port. |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18.18+
- **Chrome / Edge / Brave** (Web Speech API) with microphone access for voice calls.

### Install both apps

```bash
npm run setup        # installs backend/ and frontend/ dependencies
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
npm test             # backend unit tests (audio codecs, VAD, unconfigured telephony)
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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Enable phone telephony. Leave blank to disable. |
| `PUBLIC_BASE_URL` | Public HTTPS URL of the API (e.g. ngrok or Render) so Twilio webhooks can reach it. |
| `TWILIO_VALIDATE` | Set `false` only for local TwiML testing without signature validation. |
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

**Two ways to provide the Groq key:**
1. **Server-wide** — `GROQ_API_KEY` in `backend/.env`. Everyone gets live AI.
2. **Per-browser** — paste it in **Settings → AI engine** (kept in `localStorage`,
   sent per request; a non-empty browser key wins over the server one).

The Settings page reads `GET /api/health` to show which mode is actually live.

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
    ├── App.jsx                    # Router + React Query + toast providers
    ├── pages/                     # CallPage, HistoryPage, AnalyticsPage, LeadsPage, SettingsPage
    ├── components/
    │   ├── AppShell.jsx           # Sidebar/nav layout, product + health context
    │   ├── AudioVisualizer.jsx    # Canvas waveform (real mic spectrum while listening)
    │   ├── ProductPicker.jsx      # Preset + custom SaaS product dialog
    │   └── ui/                    # button, card, badge, dialog, input, table, toast
    ├── hooks/useCallSession.js    # Call state machine: turns, recording, summary, lead extract
    ├── services/                  # api.js (all HTTP), speechService.js (Web Speech), audioRecorder.js
    ├── lib/cn.js                  # class-name merger (clsx + tailwind-merge)
    └── styles/index.css           # Tailwind layers + scrollbars + glow utilities
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
    │   └── telephony.js           # Twilio Media Streams: VAD → STT → turn → TTS → barge-in
    ├── utils/audioCodecs.js       # μ-law ↔ PCM, WAV parse/build, resampling, RMS
    ├── data/                      # calls.json, leads.json (created on first boot)
    ├── recordings/                # uploaded call audio
    └── tests/telephony.test.js    # codec + VAD + unconfigured-telephony unit tests
```

### API surface

`GET /api/health` · `GET /api/products` · `POST /api/chat` · `POST /api/summarize` ·
`GET/POST/DELETE /api/calls` · `POST /api/upload-recording` · `GET /api/analytics` ·
`GET/POST/PATCH/DELETE /api/leads` · `POST /api/leads/extract` ·
`GET /api/export/{calls.csv,calls.json,leads.csv}` ·
`GET/POST /api/twilio/status` · `POST /api/twilio/voice` · `POST /api/twilio/call-out` ·
`WS /ws/media` (phone audio).

---

## 📞 Enabling real phone calls (optional)

1. Buy a Twilio number, then add `TWILIO_*` + `PUBLIC_BASE_URL` to `backend/.env`.
2. Expose the API locally: `ngrok http 3001`, set `PUBLIC_BASE_URL` to the https URL, restart.
   (When deployed to Render, `PUBLIC_BASE_URL` is just the Render service URL.)
3. Point the number's **Voice webhook** to `{PUBLIC_BASE_URL}/api/twilio/voice`.
4. Inbound calls run the full STT → LLM → TTS loop and are saved with
   `channel: phone`; **Settings → Call me** places an outbound test call.

Without Twilio credentials every telephony route answers `501` and the Settings
page shows the setup guide instead of the dialer.

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

- `npm test` runs the backend unit suite: μ-law round trips, WAV parse/build,
  resampling, chunk pacing, energy VAD segmentation, and the 501 behavior of an
  unconfigured telephony stack (real ephemeral Express server).
- The browser voice path depends on a physical microphone and OS speech
  synthesis, so it can't be fully automated. Smoke-test it manually:
  1. Start a call and let the greeting finish.
  2. **Stay silent ~5s**, then keep talking — the bot must still be listening
     (this is the regression v1 had).
  3. Interrupt the bot mid-sentence — playback should stop and pick up your words.
  4. Use the typed-input box and end the call; check summary, recording playback,
     history persistence, auto-extracted lead, and the analytics page.
