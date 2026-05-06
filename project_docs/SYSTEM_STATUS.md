# J.A.R.V.I.S. System Status

## Quick Links
- **Architecture**: `project_docs/ARCHITECTURE.md`
- **Roadmap**: `project_docs/ROADMAP.md`
- **Debugging Guide**: `project_docs/DEBUGGING.md`
- **Changelog**: `project_docs/CHANGELOG.md`

## Current Features Implemented
* **Glassmorphism UI**: React-based frontend with real-time SSE chat streaming, voice visualization orb, and HUD status indicators.
* **Zoya Commander Mode (V2)**: Stabilized Gemini 3.1 Flash Live voice interface with 24kHz audio, 3-model fallback cascade, and real-time SDK integration (v1.47.0).
* **Time-Aware AI**: Dynamic system instruction generator injects current date, time, and user timezone into Zoya's context for sub-second situational awareness.
* **Unified Bridge Setup**: `jarvisBridge.ts` routes both Voice (WebSocket) and Chat (SSE HTTP) inputs uniformly.
* **Key Rotation & Multi-Provider Cascade**: `llmRouter.ts` prioritizes GPT-4o → DeepSeek → Llama-3.3 for resilient, intelligent planning.
* **Memory Management**: Dual-layer JSON approach (`memoryManager.ts`) with operational logs and summarized LLM context.
* **Continuous Audio**: Browser `ScriptProcessor` (optimized for Zoya) captures MIC data, streaming raw PCM chunks to Gemini Live with sub-200ms latency.

## Working Components
* Text-To-Speech (ElevenLabs/OpenAI) + Speech-To-Text (Groq Whisper)
* API Key rotation and Token Logging
* Playwright Backend Navigation (open URLs, search YouTube)
* Encrypted credential storage stubs
* **Intent Classification & Orchestrator Flow**: Routes traffic cleanly between simple chat and browser tasks.
* **Strict JSON Page Planning**: Planner strictly outputs deterministic JSON step arrays `{"steps": []}` with `internal_steps` reasoning and dynamic DOM pruning.
 * **Shared Confirmation Loop**: Enhanced `confirmationState.ts` with Session State Manager and State Guard in orchestrator. Centralized confirmation handling with comprehensive logging.
 * **Action Result Visibility**: Structured JSON logging for all browser planner successes/failures.
 * **State Guard**: Confirmation check now happens BEFORE IntentClassifier, preventing yes/no bypass.
 * **YouTube Ad Watcher**: Background thread that continuously polls for and automatically skips YouTube ads without user confirmation. Logs ACTION RESULT format with success, action, target, and details.
 * **File Logging**: Python agent now logs to both console and logs/debug.log file for better debugging.
 * **Chrome Driver Stability**: Fixed connection issues by removing user-data-dir configuration and creating fresh ChromeOptions objects in fallback paths.

* **Playwright Click Accuracy**: The "Universal DOM Extractor" continues to improve through native YouTube action mappings.
* **Viewport Syncing**: The Playwright Chromium instance uses a static viewport that does not respond to the React frontend UI pane size.

## Recent Fixes (2026-05-06)
- **ZOYA VOICE STABILIZATION**: Fixed Gemini 3.1 Flash connection drops by upgrading `@google/genai` to 1.47.0 and stripping invalid config parameters.
- **API KEY GHOST QUOTES**: Fixed literal quote parsing in `.env.local` that was invalidating API keys in the browser environment.
- **TIME-AWARE AI**: Integrated `TimezoneClock` and dynamic instruction generator to provide Zoya with real-time date/time context.
- **MULTI-PROVIDER PLANNER**: Upgraded LLM planner to cascade through OpenAI → DeepSeek → Groq based on key availability.
- **ORCHESTRATOR BRIDGE**: Created `/api/zoya-execute` to route Gemini's voice intents directly into the Python automation agent.

## Older Fixes (2026-03-27)
- **YOUTUBE AD WATCHER IMPLEMENTED**: Background thread continuously polls for and automatically skips YouTube ads without user confirmation. Logs ACTION RESULT format with success, action, target, and details.
- **FILE LOGGING ADDED**: Python agent now logs to both console and logs/debug.log file for better debugging and visibility.
- **CHROME DRIVER STABILITY**: Fixed connection issues by removing user-data-dir configuration and creating fresh ChromeOptions objects in fallback paths.
- **CONFIRMATION BYPASS ENHANCED**: State Guard now intercepts yes/no inputs even without pending confirmation, preventing misclassification.
- **EXECUTION DROP FIXED**: Refactored executor.ts sequential async loop with improved logging and step tracking; verified multi-step execution works.
- **WEBSOCKET CONFIRMATION UNIFIED**: Replaced duplicate confirmation logic in websocket.ts with centralized checkConfirmationInput.

Last Update: 2026-05-06 - **Zoya Voice Stabilized & Time-Aware Intelligence Complete**
