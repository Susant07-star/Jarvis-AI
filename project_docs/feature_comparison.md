# J.A.R.V.I.S. Runtime and Capability Map

This is a source-level inventory of the main packages in the repository. It replaces the older two-system comparison, which treated planned integrations as completed. A capability listed here may still need credentials, schema, a running service, or end-to-end verification.

| Component | Main code | Role | Runtime relationship |
|---|---|---|---|
| **Web application and Node service** | `src/`, `server.ts`, `server/` | Web chat and voice UI, intent routing, model cascades, tool loop, planner, scheduler, memory, MCP, Telegram integration, logs/metrics | Root application; `npm run dev` starts this runtime. |
| **Python browser service** | `python_agent/youtube_agent.py`, `python_agent/trusted_sites_agent/` | Selenium browser execution, page marking, screenshots, DOM helpers, action endpoints | Separate FastAPI process on port `8000`; root calls it only when `USE_BROWSER_AGENT=true`. |
| **I.R.I.S. desktop bridge** | `server/irisIntentRouter.ts`, `server/irisExecutor.ts`, desktop package code | Forwards selected local computer actions through a configured URL and shared token | Requires a separate local daemon and reachable endpoint. Not available when the local host/bridge is offline. |
| **Voice matching service** | `voice_engine_microservice/` | SpeechBrain embeddings and speaker similarity lookup | Separate Python service; optional and not secure identity proof. |
| **Electron desktop application** | `jarvis-desktop/` | Independent desktop renderer, main/preload processes, local tools, and duplicated server modules | Separate npm/Electron runtime with independent setup/build scripts; not bundled by the root package. |

## What makes this more than a voice-command UI

The root application has multiple control paths: intent classification; confirmation-state handling; direct chat with a bounded tool loop; structured browser planning; asynchronous research and delivery; one-time and recurring scheduling; semantic memory and a knowledge base; MCP tool discovery/dispatch; and optional remote-to-local action bridges. The frontends are clients of these services, not the full system.

The system is not currently a distributed swarm of specialized autonomous agents. It is a set of explicit TypeScript orchestration and execution paths, with modular prompt configurations and optional external services. Use “agentic workflows” or “tool-using assistant” when describing the checked-in behavior unless a specific multi-agent runtime is implemented and verified.

## Integration boundaries to preserve

- **Voice and text chat have different cascades.** `gemini-3.8-live-extended-thinking` is first for the web Gemini Live session. Text chat, planning, and research use other cascades.
- **Browser tasks and local OS actions are different executors.** Browser work can go to the Python service; some action plans are transformed and forwarded to I.R.I.S. They do not share a single permission system.
- **Persistence is split.** Thread messages, embeddings, knowledge records, tasks, cron jobs, runtime JSON files, and logs have different storage and recovery semantics.
- **Electron and web are separate products in the repo.** Similar filenames or feature names do not establish a shared state store or identical action path.
- **Optional means conditional.** A source module does not prove that a deployment has credentials, schema, network access, or a running process.

See [Architecture](ARCHITECTURE.md), [System Status](SYSTEM_STATUS.md), and [Developer Guide](DEVELOPER_GUIDE.md) for code paths and setup requirements.
