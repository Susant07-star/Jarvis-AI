# J.A.R.V.I.S. Project Instructions

These rules apply to changes in this repository. The authoritative current overview is [Architecture](ARCHITECTURE.md), with implementation/configuration caveats in [System Status](SYSTEM_STATUS.md). Roadmaps and analysis notes are not proof that a feature is implemented.

## Preserve the system boundaries

- Trace the actual client, route, orchestrator, and executor before changing behavior. The root web service, Telegram bot, Python browser service, I.R.I.S. daemon, voice microservice, and `jarvis-desktop/` package are separate runtimes.
- Do not assume that a feature works everywhere because it exists in one surface or prompt. Document the exact routes and required services.
- Keep model routing task-specific. Live voice, chat, planning, and research have different model/provider cascades.
- The root implementation uses hand-written TypeScript orchestration. Do not describe it as LangGraph-based or migrate frameworks without a concrete requirement and comparison.

## Treat model output as untrusted input

- Models can propose actions; backend code owns authorization and execution.
- Validate every tool/action payload against a schema before it reaches a browser, shell, filesystem, database, Telegram account, or local desktop.
- Apply confirmation gates in code for consequential operations. A prompt instruction alone is not an authorization boundary.
- Enforce timeouts, cancellation, bounded retries, and useful failure results. Do not report success unless the executor confirms it.
- Do not make global claims like “I.R.I.S. is online” or “voice verified” unless the runtime health check actually confirms that state.

## Protect secrets and user data

- Keep API keys, Telegram tokens, PINs, voice embeddings, browser profiles, and user data out of Git, prompts, screenshots, and logs.
- `.env.example` contains demonstration values. Do not copy them into a live deployment; replace all secrets with unique values.
- Do not expose the Python browser service or MCP process endpoints to untrusted networks. Review external-process permissions before adding an MCP server.
- Do not describe the current voice matching heuristic as reliable authentication or anti-spoofing.

## Keep prompts and integrations maintainable

- Put root web prompt modules under `server/agent_prompts/`; the `jarvis-desktop/` package has a separate prompt tree.
- Add capabilities through a typed dispatcher or route with validation, logging, and consistent result handling. Avoid hiding side effects in prompt text.
- Keep one-time tasks, recurring jobs, chat memory, and knowledge-base records distinct in both code and documentation.
- Update canonical docs (`README.md`, `project_docs/ARCHITECTURE.md`, `SYSTEM_STATUS.md`, and relevant setup docs) when the actual runtime contract changes.

## Verification and reporting

- Run the smallest relevant checks available for the changed package. Root `npm run lint` is a TypeScript check; it is not an integration test. Root `package.json` has no general `test` script.
- Never claim an external integration, model, deployment, or local device was tested unless it was actually exercised.
- Update `project_docs/CHANGELOG.md` for notable runtime changes. Documentation-only edits may be recorded under an unreleased documentation entry.
- Preserve unrelated working-tree changes. Do not stage or publish work unless requested.
