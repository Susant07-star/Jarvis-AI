# J.A.R.V.I.S. Architecture Documentation

## 1. Frontend Layer (React / Vite)
Located in `src/`. The user interface is a responsive, glassmorphism-styled dashboard. 
*   **ChatWindow.tsx**: Displays SSE-streamed messages from the Node backend. Includes positive/negative feedback logging buttons.
*   **VoiceVisualizer.tsx**: Provides visual feedback for voice pipeline state (`listening`, `processing`, `speaking`).
*   **useJarvisVoice.ts**: A custom React Hook that captures raw PCM mic data via an `AudioWorklet`, monitors `SpeechRecognition`'s `isFinal` event to reliably trigger debounced `speech_end` transmissions.

## 2. Backend Brain (Node.js / Express)
Located in `server/`. This is the core cognitive routing layer.
*   **Orchestrator**: The incoming command (from `api.ts` or `websocket.ts`) is routed through `jarvisBridge.ts` into an Intent Classifier (to decide between casual chat or a browser task). **[PHASE 1 FIX]**: Now includes State Guard that checks confirmation state BEFORE IntentClassifier to prevent yes/no bypass.
*   **Planner (`planner.ts`)**: Takes a complex intent and generates a strict JSON sequence of browser actions. Outputs `requires_confirmation: true` for sensitive actions (`youtube_like`, `youtube_subscribe`, `youtube_comment`, `type_secure`) or plans with > 3 steps.
*   **Confirmation Gateway (`confirmationState.ts`)**: Both `api.ts` and `websocket.ts` share a central singleton for pending plans. This ensures that a plan created via voice (WebSocket) can be confirmed via text (API), preventing channel-mismatch bugs. **[PHASE 1 FIX]**: Enhanced with Session State Manager and `checkConfirmationInput()` function that intercepts yes/no inputs even without pending confirmation. Supports:
    - `yes` → execute stored plan
    - `no` → cancel stored plan
    - `new command` → replace pending plan
    - `help/explain` → describe pending plan
*   **SerpAPI Integration**: Node-side `serp_api_search` action executes inline without Python, tracking `+50` tokens per query via `MetricsTracker`.
*   **Executor (`executor.ts`)**: Parses the planned JSON and sends corresponding HTTP instructions to the Python Agent. **[PHASE 1 FIX]**: Refactored into a sequential async loop that executes all steps in the plan array. Includes resume support (skips completed steps), retry logic (3 attempts per step), and comprehensive error logging with memory snapshots.
*   **Memory (`memory.ts`)**: Maintains a synchronized session context in `session_memory.json`. Now includes a **Unified Memory Bridge**:
    - `getSessionContextSummary()` extracts the last 20 messages for cross-modal awareness.
    - Voice (Zoya) fetches this summary at start to "remember" previous chat turns.
*   **Cascading Brain (`llmRouter.ts`)**: The core intelligence layer. Replaces the old single-provider logic with a multi-tier, multi-pool cascade:
    - **Tier 0**: Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite-preview`) — New primary reasoning brain.
    - **Tier 1**: DeepSeek V3.2 / V3.1 — Logic and complex reasoning leaders.
    - **Tier 2**: GPT-OSS 120B — High-parameter fallback.
    - **Tier 3**: Llama 3.3 / 70B — High-speed conversational fallback.
*   **Self-Healing Key Rotation**: Dynamically round-robins multiple API keys per provider. Retries up to 3 separate keys on rate limits (429) before cascading to the next provider. Logs every failed attempt with the exact error message for maximum visibility.
*   **Observability (`metrics.ts`)**: Tracks per-request token usage (classifier, planner, direct, DOM, SerpAPI) and latency, writing structured JSON to `logs/token_detailed.json`. Structured "ACTION RESULT" logs verify tool success/failure. **[PHASE 1 FIX]**: Enhanced with step-level logging (STEP START, STEP RESULT) and Python agent error visibility in Node logs.
*   **Planner Logic**: Includes `internal_steps` for reasoning transparency and dynamic DOM pruning to stay within `max_tokens_hint`.

## 3. Executor Engine (Python / Selenium)
Located in `python_agent/`. This is the "hands" and "eyes" of the system.
*   **youtube_agent.py**: A FastAPI server wrapped around an ongoing Selenium/undetected-chromedriver browser session.
*   **DOM Extractor**: Injects JavaScript to extract a unified `{elements: [{id, text, role, selector, xpath}]}` array. Results are cached globally in `last_extracted_elements` for smart element matching.
*   **Safe Click (`safe_click`)**: Multi-fallback click pipeline: `jarvis_id` → CSS selector → XPath → text similarity. Scrolls into view, retries up to 3 times using standard click → JS click → ActionChains. Performs post-action verification (URL change or element disappearance).
*   **YouTube Actions**: Native `youtube_like`, `youtube_subscribe`, `youtube_comment` commands targeting YouTube's specific DOM selectors.
*   **Secure Form Filling (`type_secure`)**: Resolves credential keys from environment variables, injects values into password fields via DOM events without logging plaintext.
*   **Post-Action Verification System**: **[PHASE 1 FIX]**: Each action now validates result using:
    - URL-based verification for navigation actions (`open_tab`, `new_tab`, `search_site`)
    - DOM-based verification for interaction actions (`click`, `type`, `youtube_like`, `youtube_subscribe`)
    - Page state verification for other actions (`scroll`, `wait`, `skip_ad`, `media_control`)
    - Prevents false success logs by confirming actual state changes
*   **Structured Result Format**: **[PHASE 1 FIX]**: All actions now return standardized JSON:
    ```json
    {
      "action": "...",
      "status": "success/failure",
      "error": "...",
      "details": "..."
    }
    ```

## 4. Data Flow (Input → Orchestrator → Execution)
1.  **Input Phase**: User speaks into the microphone (transcribed by Whisper STT via WebSockets) OR types a chat message (HTTP POST).
2.  **Orchestrator Phase**: `jarvisBridge.ts` unifies input. **[PHASE 1 FIX]**: State Guard checks confirmation state BEFORE `intentClassifier.ts` to prevent yes/no bypass. `intentClassifier.ts` decides if it's a `direct` chat (e.g., "Hello") or an `agent` task (e.g., "Play a video"). Both modes utilize the **Cascading Brain** (`llmRouter.ts`) for maximum reliability.
3.  **Planning Phase**: If `agent` mode, `planner.ts` reads the current DOM Context, prunes it to fit the token budget, and outputs a strict JSON step array including `internal_steps` reasoning.
4.  **Confirmation Phase**: If `requires_confirmation` is `true`, the system pauses, caches the plan in the shared `confirmationState`, and asks the user for explicit approval. **[PHASE 1 FIX]**: Enhanced confirmation flow supports:
    - `yes` → execute stored plan
    - `no` → cancel stored plan
    - `new command` → replace pending plan
    - `help/explain` → describe pending plan
5.  **Execution Phase**: Node actions (e.g., `serp_api_search`) execute inline. Browser actions are forwarded to the Python Agent. **[PHASE 1 FIX]**: Sequential async loop executes all steps in the plan array with resume support, retry logic (3 attempts per step), and comprehensive error logging. Every step records a success/failure snapshot in `taskTracker.ts`. The `safe_click` pipeline handles retries and fallback methods transparently.
6.  **Verification Phase**: **[PHASE 1 FIX]**: Each action validates result using URL change OR DOM state change to prevent false success logs.
7.  **Output Phase**: Final success confirmation is returned to the Node backend, which uses TTS to respond back to the React UI asynchronously. **[PHASE 1 FIX]**: Enhanced logging with step-level markers (STEP START, STEP RESULT) and Python agent error visibility in Node logs.

## 5. Cross-Modal Memory Sync
To ensure J.A.R.V.I.S. maintains a single unified memory regardless of whether the user is typing or talking:
- **Zoya → Server**: During a voice session, the `ZoyaLiveService` pushes transcribed turns to `/api/memory/sync` (fire-and-forget).
- **Server → Zoya**: When a voice session starts, Zoya fetches a summary of recent chat history from `/api/session-context` and injects it into her system prompt.
- **Unified IDs**: Voice turns use `zoya-UUID` or `user-UUID` to track streaming chunks and prevent duplication in the Chat Window.
- **Emotion Tracking**: Emotions (e.g., `[SASSY]`) are parsed from responses and displayed as visual badges in the UI, synchronized across both chat and voice modalities.

## 6. Metrics & Logging
The system utilizes a structured metrics layer to track performance and cost:
- **MetricsTracker**: A centralized utility in `server/utils/metrics.ts` that captures input, intent, orchestration mode, and token usage.
- **Token Detailed Log**: All interactions append a JSON entry to `logs/token_detailed.json` containing specific counts for each pipeline stage (Classifier, Planner, Direct Chat, DOM analysis, and Voice Sync).
- **Health Logs**: `logs/debug.log` captures system-wide errors and info events, managed by `rotate_logs.ps1` to prevent storage bloat.
