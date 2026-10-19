# J.A.R.V.I.S. Repository Status

> **Updated:** 2026-10-19
>
> **Assessment type:** Source review of this checkout, not a live health check. No claim here means a cloud service, credential, database, bot, or desktop daemon was reachable during review.

## Implemented in the repository

- React/Vite web interface with chat, Gemini Live voice UI, browser-agent panel, task/job pages, MCP settings, timezone controls, and selected runtime telemetry.
- Express APIs, SSE chat responses, a WebSocket server, intent classification, confirmation state, per-task model routing, modular prompts, and a bounded tool loop.
- Structured browser task planning and a Python FastAPI/Selenium browser service. The service is used only when the browser-agent path is enabled and it is reachable.
- Optional I.R.I.S. bridge for forwarding selected local desktop actions to a separate daemon.
- Telegram bot integration code for messages, audio transcription, scheduling, and links to a web call UI.
- Supabase-backed thread/knowledge/task/job code with local thread-file fallback.
- MCP stdio server configuration, discovery, and tool dispatch.
- Separate Electron application under `jarvis-desktop/`, with its own runtime, renderer, native integrations, and package scripts.
- Optional SpeechBrain voice matching service under `voice_engine_microservice/`.

## Configuration-dependent capabilities

| Capability | Required configuration or service |
|---|---|
| Web chat | `GEMINI_API_KEY` and `GROQ_API_KEY` are both needed by the current chat route/classification path; provider access must be valid. |
| Gemini Live voice | `GEMINI_API_KEY`, browser microphone permission, and access to the configured Gemini Live model. The code tries `gemini-3.8-live-extended-thinking` first, then the existing fallbacks. |
| Browser execution | `USE_BROWSER_AGENT=true` and the Python service reachable at `127.0.0.1:8000`; browser tasks are unavailable when the flag is off. |
| Local desktop actions | I.R.I.S. daemon running and reachable at `IRIS_WORMHOLE_URL`, with a matching private `IRIS_API_KEY`. |
| Telegram | Bot token, admin/chat configuration, and a reachable Telegram API. |
| Semantic memory / knowledge | Supabase URL and key, expected tables, and `match_memories` / `match_knowledge` RPC functions. |
| Recurring schedules | Supabase `research_jobs` table and the Node service running to schedule jobs. |
| MCP integrations | Valid server definitions in runtime `data/mcp_config.json` and executable server commands. |
| Voice matching | Voice service URL and matching API secret; this feature is not suitable as a security control. |

## Known limitations and review items

1. **The system is not a single unified runtime.** Root web, Python browser service, voice service, I.R.I.S. daemon, Telegram bot, and Electron app start and fail independently. Some features are duplicated across the web and desktop packages.
2. **Browser execution is local and optional.** The Python service binds to `0.0.0.0:8000` and its endpoints do not use the Node service's PIN middleware. Keep it on a trusted host/network and do not expose it publicly as-is.
3. **Gemini Live credentials are browser-visible.** The Live voice client connects directly to Gemini, so the backend sends `GEMINI_API_KEY` to an authenticated browser session. This is not suitable for a shared or public deployment without moving the Live connection behind a server-side proxy.
4. **Google identity is not enforced by the backend.** The owner allowlist is checked in the React client; API routes authenticate using the shared PIN. Anyone who knows the PIN can call the APIs without the Google login check.
5. **The environment template includes sample values.** Replace every sample/default credential with unique private values. Never use template values in a deployed environment.
6. **Voice liveness is heuristic.** `voice_engine_microservice/app.py` checks audio characteristics and speaker embeddings; this is not a robust anti-spoofing or identity-verification system.
7. **Scheduling is not externally queued.** Timers and cron schedules execute in the Node process. Supabase records help restore state, but delivery depends on service uptime and downstream integrations.
8. **Some state paths are not unified.** Threads, knowledge, one-time tasks, recurring jobs, and logs have different persistence paths. Web and Telegram context sharing depends on thread IDs and explicit sync code.
9. **Browser automation implementations overlap.** The root includes Python Selenium endpoints and Playwright modules. Verify the active call path before changing or documenting a particular executor.
10. **Root web route has a provider configuration constraint.** `/api/chat` currently rejects requests when `GROQ_API_KEY` is absent before using its chat provider cascade, even though that cascade includes Gemini.
11. **Automated verification is limited.** The root `package.json` exposes `lint` as `tsc --noEmit` and has no general `test` script. A successful type check does not validate browser automation, external APIs, integrations, or deployment behavior.

## Current overall status

The codebase is a substantial personal agent system with multiple interfaces and action pathways. The repository shows implemented orchestration and integration code, but it should be treated as a development project until the optional services, security boundaries, persistence behavior, and end-to-end workflows are verified in the intended deployment.

For planned work, see [Roadmap](ROADMAP.md). For setup, see [Developer Guide](DEVELOPER_GUIDE.md). For design details, see [Architecture](ARCHITECTURE.md).
