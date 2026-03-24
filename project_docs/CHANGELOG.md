# J.A.R.V.I.S. Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### [2026-03-24] Phase 1 Stabilization Complete
- **Fix**: Resolved `logger.debug` calling non-existent method in `planner.ts`.
- **Fix**: Implemented shared `confirmationState.ts` singleton to prevent "yes/no" channel-mismatch between WebSocket and API.
- **Fix**: Corrected Intent Classifier idiom misfires (e.g., "It's looking up").
- **Fix**: Resolved `media_control` JSON key collision by renaming sub-action to `command`.
- **Feature**: Added `internal_steps` reasoning array to Planner output for real-time thought streaming.
- **Feature**: Implemented dynamic DOM pruning and prompt trimming to maintain `max_tokens_hint` safety.
- **Feature**: Added structured `ACTION RESULT` JSON logging for all browser planner failures.

### Added
- **Improvement** [2026-03-24T16:49:00.000Z]: Security and API Enhancements implemented. Added Youtube auto-actions (`youtube_like`, `youtube_subscribe`, `youtube_comment`), injected Node Confirmation Loop gates, integrated `type_secure`, and mapped SerpAPI integrations.
- **Improvement** [2026-03-24T16:34:00.000Z]: Browser Execution Upgrade implemented. Extrapolated safe_click mapping into the Python Agent.
- Created `project_docs/` system for structured tracking (`SYSTEM_STATUS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`).
- **Intent Classifier (`server/intentClassifier.ts`)**: Fast keyword and LLM schema-fallback engine to separate conversational queries from actionable tasks.
- **Orchestrator (`server/orchestrator.ts`)**: The new central routing unit for all Node.js ingress (`api.ts` and `websocket.ts`), removing autonomous `auto` tool-calling behavior from OpenAI/Groq loop.
- **Strict JSON Browser Planner (`server/browser/planner.ts`)**: Rewritten to force strict `{"steps": []}` JSON outputs and forbid generic XML/tool leakage in UI. Prompt utilizes `jarvis_id` specifically for click paths.

### Changed
- **DOM Extractor Optimization (`python_agent/youtube_agent.py`)**: Massive rewrite of `DOM_EXTRACTOR_JS` to output compact JSON `{ buttons: [], links: [], inputs: [], texts: [] }` arrays instead of giant concatenated strings.
- **Tool Execution Wiring (`routes/api.ts`, `websocket.ts`)**: Stripped old LLM recursive loop. Node backend now fetches DOM -> requests JSON Plan -> routes directly to Python agent without LLM recursion.
- Replaced unreliable raw audio frequency silence detection with `SpeechRecognition` `isFinal` phrase debouncing in `useJarvisVoice.ts`.
- Rewrote `llm.ts` to support round-robin API key rotation and automatic 429 recovery via `callWithRetry`.
- Replaced global `console.log` spam with a structured, file-based `logger.ts`.
- Complete UI Overhaul: Applied Tailwind glassmorphism styles, source tags (Voice/Chat) to messages, and a unified HUD bar.

### Fixed
- Fixed raw XML tool leakage appearing in the frontend React chat window.
- Fixed infinite/hanging wait states when taking browser actions.
- Stabilized voice transcription and reduced silent hangs.
- Added strict safety guards in `stt.ts` to prevent Whisper model errors on sub-0.5s empty audio frames.
