# J.A.R.V.I.S. Developer Guide

This guide covers the root web application and its optional services. It is based on the checked-in source and is not a deployment health report. Read [Architecture](ARCHITECTURE.md) for component relationships and [System Status](SYSTEM_STATUS.md) for current limits.

## Requirements

- Node.js and npm compatible with the root package dependencies.
- A Gemini API key for Gemini-backed text, embedding, and Live voice paths.
- A Groq API key for the current web chat route and the Groq-backed classification/transcription paths.
- Optional credentials and services for Supabase, Telegram, search providers, MCP, the Python browser service, I.R.I.S., and voice matching.

## Start the root web app

```powershell
npm ci
Copy-Item .env.example .env.local
# Edit .env.local and replace every placeholder/sample value.
npm run dev
```

The root `dev` script runs `tsx server.ts`. The server starts Express and Vite on port `3000` by default. The API listens on `0.0.0.0`, so configure access controls and network exposure before running it on a shared or public network.

Common root scripts:

```powershell
npm run lint   # TypeScript type check (tsc --noEmit)
npm run build  # Vite production build
```

The root package does not provide a general `test` script. Do not treat `lint` as an integration test of external services or action execution.

## Environment variables

Use `.env.local` for local-only values. `.env.example` is a variable-name reference, not a secure production configuration; it currently includes demo/default values that must be replaced. The root process loads `.env` and then `.env.local`; `dotenv` does not overwrite existing values by default, so `.env` takes precedence when both files define the same variable.

| Variable(s) | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini text, embedding, research, and Live voice access. Comma-separated pools are supported in some server paths. |
| `GROQ_API_KEY` | Required by the current `/api/chat` route and used by Groq-backed classification/transcription paths. A comma-separated pool is supported. |
| `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY` | Optional text-provider fallback credentials. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_KEY` | Supabase URL and browser-safe anon key support Google auth; `SUPABASE_KEY` is server-side persistence only and must not be a service-role value exposed to the browser. Database tables and vector RPC functions must also be provisioned. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Optional Telegram bot and notification routing. |
| `TAVILY_API_KEY`, `SERPAPI_API_KEY` | Optional search integrations used by selected research/planning paths. |
| `JARVIS_PIN`, `JARVIS_LOG_TOKEN`, `OWNER_EMAIL` | Required Web API and WebSocket PIN, optional separate log access token, and owner configuration. The server refuses to start if `JARVIS_PIN` is missing; log routes enforce their own access rules. |
| `USE_BROWSER_AGENT` | Set to `true` to enable the Python browser service path. The service must be running on `127.0.0.1:8000`. |
| `IRIS_WORMHOLE_URL`, `IRIS_API_KEY` | Optional connection to the local I.R.I.S. desktop daemon. Use a unique shared secret. |
| `HUGGINGFACE_VOICE_API_URL`, `HUGGINGFACE_VOICE_API_KEY` | Optional external voice matching endpoint and secret. |
| `APP_URL`, `MACRODROID_WEBHOOK_URL` | Optional public app URL and MacroDroid notification integration. |

The exact variables read by the runtime can change; search the relevant source before adding a new deployment variable. Never copy a real key into tracked documentation or logs.

## Optional Python browser service

This service is separate from the root Node process. The web server calls it at `http://127.0.0.1:8000` when `USE_BROWSER_AGENT=true`.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python_agent/requirements.txt
python python_agent/youtube_agent.py
```

It starts a FastAPI/Selenium service on port `8000` and expects a working Chrome installation. The current service binds to `0.0.0.0` and does not authenticate its action endpoints. Use only on a trusted host/network; do not expose it directly to the internet.

## Optional Supabase setup

The code expects:

- `memory_store` for thread messages and optional embeddings, plus `match_memories` for semantic recall.
- `knowledge_base` for saved notes/documents, plus `match_knowledge` for semantic search.
- `tasks` for persisted one-time task state.
- `research_jobs` for recurring routines.

Schema and RPC definitions must match the arguments used in `server/threadManager.ts`, `server/knowledgeManager.ts`, `server/scheduler.ts`, and `server/cronJobs.ts`. The repository's presence of Supabase client code does not create these objects automatically.

## Optional Electron desktop app

`jarvis-desktop/` is its own npm package. From that directory:

```powershell
npm ci
npm run dev
```

Build commands are defined in `jarvis-desktop/package.json` (`build`, `build:win`, `build:mac`, and `build:linux`). The desktop app is not launched by the root `npm run dev` or root build. Review its own README and current code before assuming its integrations match the web service.

## Code map

| Area | Important files |
|---|---|
| Server startup and middleware | `server.ts` |
| API routes | `server/routes/api.ts` |
| Intent classification and confirmation | `server/intentClassifier.ts`, `server/orchestrator.ts`, `server/confirmationState.ts` |
| Provider cascades | `server/llmRouter.ts` |
| Iterative tool execution | `server/agenticLoop.ts`, `server/toolDispatcher.ts`, `server/tools.ts` |
| Browser planning and optional visual Python bridge | `server/browser/planner.ts`, `python_agent/youtube_agent.py` |
| Gemini Live voice client | `src/services/zoyaLiveService.ts` |
| Thread and semantic memory | `server/threadManager.ts`, `server/knowledgeManager.ts` |
| One-time and recurring work | `server/scheduler.ts`, `server/cronJobs.ts` |
| MCP process management | `server/mcpManager.ts` |
| I.R.I.S. bridge | `server/irisIntentRouter.ts`, `server/irisExecutor.ts` |
| Logs and metrics | `server/logger.ts`, `server/utils/metrics.ts`, `server/logPortal.ts` |

## Extending the system safely

1. Trace the feature from the specific client/API entry point through orchestration to the executor. Similar names in another package do not imply shared behavior.
2. Keep model output as untrusted input. Parse it, validate it against a typed schema, enforce authorization and confirmation policy in code, then execute it in a bounded backend function.
3. Return the actual executor result to the user and conversation state. Never report success solely because a model proposed an action.
4. Keep prompts in the relevant `server/agent_prompts/` modules and update their README when the prompt assembly contract changes.
5. Add or update tests for the route and executor when practical. Keep tests isolated from real API keys, Telegram accounts, browser profiles, and physical devices.
6. Update the canonical architecture/status docs when execution paths or integration requirements change. Keep roadmap and historical analysis notes clearly labeled.

## Verification

For root TypeScript changes, run `npm run lint`. For frontend bundle compatibility, run `npm run build`. There is no root test script at present; run only relevant subproject checks that exist for the code changed. End-to-end browser, Telegram, voice, Supabase, and desktop behavior requires configured services and explicit integration verification.
