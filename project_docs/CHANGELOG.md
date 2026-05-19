# J.A.R.V.I.S. Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### [2026-05-19] Time-Aware Scheduler and Dynamic Task Management
- **Feature — Dynamic Alarm/Reminder Cancellation & Modification**: Enabled full voice/text task editing. Users can now say "cancel my alarm" or "change my drink water alarm to a message in 5 minutes". The scheduler injects active task metadata into the LLM parser, matches target task IDs, and dynamically deletes/reschedules tasks.
- **Feature — Time-Aware Alarm Briefings**: Replaced hardcoded wake-up briefings with a dynamic prompt context that reads user timezone and current time, adjusting output instructions based on whether the task is a wake-up call or a generic reminder.
- **Fix — Double-Reply Interception**: Configured the Telegram Bot message handler to intercept alarm disarm requests, silences the sleep watchdog loop, and early-returns before passing the text to the chat AI, preventing double-reply messages.
- **Fix — Scheduler Strict JSON Mode**: Enforced clean JSON extraction from the LLM parser to eliminate crashes on conversational text wrappers.

### [2026-05-17] Unified Brain Memory & Planner Hardening
- **Feature — Unified Brain Memory**: Connected all memory channels (Browser Voice, Browser Chat, Telegram Bot Voice, Telegram Bot Chat) into a single omnipresent consciousness. Telegram interactions now sync directly to the global `session_memory.json`, and Browser Chat dynamically merges into the active Telegram `ThreadManager` history.
- **Fix — Telegram Chat ID Caching**: Fixed a bug where Browser Voice reminders failed to route to Telegram. The system now caches the user's Telegram Chat ID upon their first interaction and uses it as a seamless fallback for all browser-initiated voice tasks (`Target: 0` error resolved).
- **Fix — Planner JSON Hallucinations**: Addressed recency bias in lightweight models (like Gemini Flash Lite) by injecting a strict JSON output anchor constraint directly into the user prompt. This decisively stops the LLM from inventing arbitrary schemas and forces compliance with the `steps` array structure.
- **Fix — Orchestrator Timeout Loops**: Implemented the `USE_BROWSER_AGENT` environment toggle to completely bypass the Python backend dependency when deployed to the cloud, eliminating the 7-second `ECONNREFUSED` timeout that caused SSE connection failures.
- **Feature — Gemini SDK v2 Support**: Upgraded `llmRouter.ts` syntax to support the new Google GenAI SDK (replacing deprecated object paths) and removed outdated prompt injections to stop generic software planning hallucinations.

### [2026-05-08] Phase 2.1: Telegram Bridge & DNS-Bypass Networking
- **Feature — Telegram Bot Integration**: Full remote interaction via `server/telegramBot.ts`. JARVIS can now handle text and voice commands (via Groq Whisper STT) from any Telegram client.
- **Critical Fix — DNS-Bypass Networking**: Implemented a "Direct-Tunnel" HTTPS requester that connects to Telegram's IP (`149.154.167.220`) with a manual `Host` header. This completely bypasses ISP-level DNS poisoning (AggregateError) common on Windows/Nepali networks.
- **Latency Overhaul**: Optimized the chat cascade by moving **Groq Llama 70B** to the primary position. Direct chat responses now average **<1 second** compared to 10-15s previously.
- **Token Optimization**: Refactored the Direct Chat pipeline to use the lightweight `voice` prompt instead of the heavy `browser` agent prompt, reducing baseline token usage by **90%**.
- **Refactor — Intent Classifier 3.0**: Removed all redundant pattern-matching regexes. Implemented a high-priority **Research Fast-Path** for live news/weather/prices, while routing all other logic through a fast Groq 8B LLM classifier (~0.3s).
- **Fix**: Resolved `lowerInput is not defined` crash in the intent classifier.
- **Feature**: Automatic long-message splitting for Telegram (>4000 chars).

### [2026-05-06] Unified Memory Bridge & Gemini Model Stabilization
- **Critical Fix — Model Name**: Corrected Gemini text API model from invalid `gemini-3.1-flash` to `gemini-3.1-flash-lite-preview`. The former only works on the Live WebSocket audio API; the latter is the correct `generateContent` REST model name — fully resolves the 404 cascade on every chat request.
- **Dedicated Gemini Chat Provider**: Added `createGeminiChatProvider()` in `llmRouter.ts` that properly separates the system prompt and user message using Gemini's `systemInstruction` config field. This eliminates the "blob prompt" issue that caused confusing or empty responses.
- **Separate Chat Cascade (`CHAT_PROVIDER_PRIORITY`)**: Chat traffic now routes through its own provider cascade (Gemini 3.1 Flash-Lite → Gemini 2.5 Flash → DeepSeek → Llama) instead of the shared planner cascade, optimized for conversational quality.
- **Full Error Visibility**: Added `logger.warn` to every failed provider attempt in both `callPlannerWithCascade` and `callChatWithCascade`. Silent failures are now impossible — every cascade event is logged with the exact error message.
- **Feature — Emotion Badges**: Implemented a visual personality layer in the Chat Window. Every message from JARVIS/Zoya now features a color-coded badge (e.g., [SASSY], [HAPPY], [THOUGHTFUL]) that dynamically updates based on the AI's persona state.
- **Feature — Real-time Voice Sync**: Voice conversations are now automatically mirrored to the server. Added `_syncMemory()` to `zoyaLiveService.ts` and `POST /api/memory/sync` to the backend, ensuring no voice turns are lost from the session memory.
- **Feature — Comprehensive Token Metrics**: Implemented `MetricsTracker` across all primary routes. The system now logs granular token usage (classifier, planner, direct, dom, and voice) to `logs/token_detailed.json` for every turn, including Zoya voice commands.
- **Feature — Neural Context HUD**: Added a real-time "Neural Context" indicator to the top navigation bar. It displays current session token usage out of a 32k high-performance limit, providing transparency into the AI's "memory load."
- **Technical — Stable Message IDs**: Migrated from timestamp-based to `crypto.randomUUID()` IDs for all voice messages. Combined with a new `findIndex` logic in `useZoyaVoice.ts`, this allows for smooth, flicker-free streaming transcriptions where chunks update the same chat bubble in real-time.
- **Voice già working**: `gemini-3.1-flash-live-preview` (Live WebSocket) remains the correct voice model name — untouched.

### [2026-05-06] J.A.R.V.I.S. Brain Upgrade & Self-Healing Reliability
- **Brain Migration**: Migrated J.A.R.V.I.S. primary intelligence to **Gemini 3.1 Flash** (Tier 0) for Voice, Chat, and Browser Planning.
- **Self-Healing Keys**: Implemented a multi-key pool mechanism in `llmRouter.ts` that retries up to 3 separate API keys per provider before cascading, effectively eliminating 429 rate-limit downtime.
- **Model Transparency**: Added real-time model metadata to the UI. Users can now see exactly which brain is responding (e.g., `gemini-3.1-flash`) in both the chat window and Zoya voice panel.
- **Dynamic Loading**: Fixed "No LLM provider configured" errors by making provider availability checks dynamic at runtime, resolving race conditions with environment variable loading.
- **Stabilization**: Resolved Gemini 3.1 Flash Live connection drops by upgrading `@google/genai` to `1.47.0` and optimizing audio output to **24kHz**.
- **Fix**: Implemented "Ghost Quote" stripping for environment variable API keys across both frontend and backend.
- **Feature**: Added **Time-Aware AI** context (Date, Time, Timezone) directly into all system instructions.
- **Feature**: Integrated `TimezoneClock.tsx` in the Navbar for user-selectable region awareness.
- **Feature**: Bridged Gemini function calls directly to the Python orchestrator via `POST /api/zoya-execute`.

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
