# J.A.R.V.I.S. Project Bootstrap

## Project overview

J.A.R.V.I.S. is a personal agentic assistant system for conversation, research, memory, scheduled work, and controlled browser or desktop actions. Voice is one interface; the repository also includes a web app, Node orchestration service, Telegram integration, optional browser and voice services, an I.R.I.S. desktop bridge, and a separate Electron application.

## Current architecture

- **Web client:** React and Vite under `src/` for chat, Live voice, task views, a browser-agent panel, and MCP settings.
- **Node service:** `server.ts` and `server/` provide Express APIs, SSE/WebSocket flows, model routing, intent classification, confirmation state, tool execution, scheduling, memory, and integrations.
- **Python browser service:** `python_agent/youtube_agent.py` is an optional FastAPI/Selenium service. Root browser actions that use it require `USE_BROWSER_AGENT=true` and a running service on port `8000`.
- **I.R.I.S.:** an optional local desktop daemon that receives selected commands from the Node server using a configured URL and shared secret.
- **Data services:** Supabase can persist thread, knowledge, one-time task, and recurring job records. The app also writes local thread files and logs.
- **Other packages:** `voice_engine_microservice/` provides optional SpeechBrain voice matching. `jarvis-desktop/` is a separate Electron project with its own runtime and dependencies.

The system is a multi-surface, tool-using agent application, not only a voice-command interface. Its components are independently configured; do not claim that an optional integration is online without checking it.

## Request flow

Web chat enters through `/api/chat` and is classified as direct conversation, an actionable task, or scheduling. Direct requests may use a bounded tool loop. Actionable tasks use a structured planner, a route-specific confirmation step, and one of the configured executors. Live voice uses the Gemini Live API from the web client and calls backend routes for selected tools. Telegram and the Electron app have their own entry points and do not automatically share every state or executor.

## Design rules

- Models propose text, plans, or tool payloads. Backend code validates, authorizes, and executes actions.
- Keep each provider/model cascade specific to its task. Live voice, chat, planning, and research use different configurations.
- Do not bypass confirmation, authentication, or safety checks for consequential actions.
- Treat model output and data from browser/MCP services as untrusted input.
- Never claim a tool or local device succeeded until its executor returns a successful result.
- Preserve the boundaries between root web, Python service, I.R.I.S., voice service, Telegram, and Electron.
- Protect secrets and personal data; do not commit `.env.local`, tokens, voice embeddings, browser profiles, or runtime data.

## Current facts and caveats

- The Live voice cascade currently lists `gemini-3.8-live-extended-thinking` first and retains its configured fallback models. This applies to Live voice, not the text chat cascade.
- Root web chat currently requires both Gemini and Groq credentials on its route/classification path.
- Browser execution requires the Python service; local OS control requires a connected I.R.I.S. daemon.
- Supabase features require the expected schema and vector RPC functions.
- The Python browser service currently binds to all interfaces without the root API PIN. Keep it private.
- The voice service's liveness check is a simple heuristic, not secure biometric authentication.
- Root orchestration is handwritten TypeScript; there is no LangGraph runtime in the root package.
- See `project_docs/SYSTEM_STATUS.md` for additional limitations and `project_docs/ROADMAP.md` for proposed engineering work.

## How to start work

1. Read `project_docs/README.md`, `project_docs/ARCHITECTURE.md`, and `project_docs/SYSTEM_STATUS.md`.
2. Identify the actual package and execution path before changing code. Read the relevant route, tool dispatcher, and executor.
3. Check `git status` and preserve unrelated existing edits.
4. Keep prompts declarative; enforce permissions and validation in code.
5. Run the relevant checks for the package changed. Do not treat type checking as proof that external integrations work.
6. Update the architecture/status documentation if the system behavior or configuration contract changed.
