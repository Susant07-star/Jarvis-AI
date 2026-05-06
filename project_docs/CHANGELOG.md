# J.A.R.V.I.S. Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### [2026-05-06] Zoya Voice Commander Integration
- **Feature**: Integrated Gemini Live API (`gemini-2.5-flash` cascade) as the primary voice layer (Zoya Mode).
- **Feature**: Added Zoya UI panel (`ZoyaPanel.tsx`, `ZoyaAvatar.tsx`, `ZoyaVisualizer.tsx`) with glassmorphism styling.
- **Feature**: Replaced direct Groq calls with multi-provider LLM cascade (`llmRouter.ts`: GPT-4o → DeepSeek-V3 → Llama-3.3).
- **Feature**: Implemented auto-reconnect logic for Gemini Live WebSocket to handle 30-min limits and drops seamlessly.
- **Feature**: Bridged Gemini function calls (`executeJarvisCommand`) to the JARVIS Python orchestrator via new `POST /api/zoya-execute` endpoint.
- **Feature**: Real-time task feedback: Zoya now speaks success/failure results naturally.

### [2026-03-27] YouTube Ad Watcher Implementation
- **Feature**: Implemented background ad watcher that continuously polls for YouTube ad skip buttons (#skip-button, .ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern)
- **Feature**: Automatic ad skipping without requiring user confirmation
- **Feature**: ACTION RESULT logging format for ad skipping with success, action, target, and details fields
- **Fix**: Added file logging configuration to Python agent (logs/debug.log) for better debugging
- **Fix**: Resolved Chrome driver connection issues by removing user-data-dir configuration
- **Fix**: Fixed ChromeOptions reuse error in fallback path by creating fresh ChromeOptions object
- **Test**: Created test_ad_watcher.py to verify ad watcher functionality
- **Test**: Verified ad watcher successfully detects and skips YouTube ads with proper logging

### [2026-03-27] Phase 1 Stabilization - State Guard Enhancement & Execution Loop Fix
- **Fix**: Enhanced `checkConfirmationInput` to intercept yes/no inputs even when no pending confirmation, preventing Intent Classifier from misclassifying them.
- **Fix**: Unified confirmation handling in `websocket.ts` to use centralized `checkConfirmationInput` instead of duplicate logic.
- **Refactor**: Improved `executor.ts` sequential async loop with better logging and step tracking.
- **Test**: Verified multi-step execution works (planner generated two steps and Python agent processed both).

### [2026-03-26] Phase 1 Stabilization - Confirmation Loop Fix
- **Fix**: Centralized confirmation state handling in `confirmationState.ts` with enhanced Session State Manager.
- **Fix**: Added State Guard in `orchestrator.ts` to check confirmation BEFORE IntentClassifier (critical fix).
- **Feature**: Implemented `checkConfirmationInput()` function that parses yes/no/new command inputs.
- **Feature**: Added comprehensive logging for state transitions: `[STATE] awaiting_confirmation = true`, `[STATE] Plan stored`, `[STATE] Confirmation received: YES/NO`, `[STATE] Executing stored plan`.
- **Refactor**: Removed duplicate confirmation logic from `api.ts` and centralized in orchestrator (single source of truth).
- **Fix**: Updated `setPendingConfirmation` to use `setPendingPlanWithMetadata` with timestamp and source tracking.

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
