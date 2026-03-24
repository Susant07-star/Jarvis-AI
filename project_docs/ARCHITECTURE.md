# J.A.R.V.I.S. Architecture Documentation

## 1. Frontend Layer (React / Vite)
Located in `src/`. The user interface is a responsive, glassmorphism-styled dashboard. 
*   **ChatWindow.tsx**: Displays SSE-streamed messages from the Node backend. Includes positive/negative feedback logging buttons.
*   **VoiceVisualizer.tsx**: Provides visual feedback for the voice pipeline state (`listening`, `processing`, `speaking`).
*   **useJarvisVoice.ts**: A custom React Hook that captures raw PCM mic data via an `AudioWorklet`, monitors `SpeechRecognition`'s `isFinal` event to reliably trigger debounced `speech_end` transmissions.

## 2. Backend Brain (Node.js / Express)
Located in `server/`. This is the core cognitive routing layer.
*   **Orchestrator**: The incoming command (from `api.ts` or `websocket.ts`) is routed through `jarvisBridge.ts` into an Intent Classifier (to decide between casual chat or a browser task).
*   **Planner (`planner.ts`)**: Takes a complex intent and generates a strict JSON sequence of browser actions. Outputs `requires_confirmation: true` for sensitive actions (`youtube_like`, `youtube_subscribe`, `youtube_comment`, `type_secure`) or plans with > 3 steps.
*   **Confirmation Gateway (`confirmationState.ts`)**: Both `api.ts` and `websocket.ts` share a central singleton for pending plans. This ensures that a plan created via voice (WebSocket) can be confirmed via text (API), preventing channel-mismatch bugs. Execution is suspended until explicit approval.
*   **SerpAPI Integration**: Node-side `serp_api_search` action executes inline without Python, tracking `+50` tokens per query via `MetricsTracker`.
*   **Executor (`executor.ts`)**: Parses the planned JSON and sends corresponding HTTP instructions to the Python Agent.
*   **Memory (`memoryManager.ts`)**: Maintains an encrypted sliding window of conversational context, automatically summarizing old tool executions to save tokens.
*   **Resilience (`llm.ts`)**: Automatically round-robins Groq API keys to prevent rate limits.
*   **Observability (`metrics.ts`)**: Tracks per-request token usage (classifier, planner, direct, DOM, SerpAPI) and latency, writing structured JSON to `logs/token_detailed.json`. Structured "ACTION RESULT" logs verify tool success/failure.
*   **Planner Logic**: Includes `internal_steps` for reasoning transparency and dynamic DOM pruning to stay within `max_tokens_hint`.

## 3. Executor Engine (Python / Selenium)
Located in `python_agent/`. This is the "hands" and "eyes" of the system.
*   **youtube_agent.py**: A FastAPI server wrapped around an ongoing Selenium/undetected-chromedriver browser session.
*   **DOM Extractor**: Injects JavaScript to extract a unified `{elements: [{id, text, role, selector, xpath}]}` array. Results are cached globally in `last_extracted_elements` for smart element matching.
*   **Safe Click (`safe_click`)**: Multi-fallback click pipeline: `jarvis_id` → CSS selector → XPath → text similarity. Scrolls into view, retries up to 3 times using standard click → JS click → ActionChains. Performs post-action verification (URL change or element disappearance).
*   **YouTube Actions**: Native `youtube_like`, `youtube_subscribe`, `youtube_comment` commands targeting YouTube's specific DOM selectors.
*   **Secure Form Filling (`type_secure`)**: Resolves credential keys from environment variables, injects values into password fields via DOM events without logging plaintext.

## 4. Data Flow (Input → Orchestrator → Execution)
1.  **Input Phase**: User speaks into the microphone (transcribed by Whisper STT via WebSockets) OR types a chat message (HTTP POST).
2.  **Orchestrator Phase**: `jarvisBridge.ts` unifies the input. `intentClassifier.ts` decides if it's a `direct` chat (e.g., "Hello") or an `agent` task (e.g., "Play a video").
3.  **Planning Phase**: If `agent` mode, the `planner.ts` reads the current DOM Context, prunes it to fit the token budget, and outputs a strict JSON step array including `internal_steps` reasoning.
4.  **Confirmation Phase**: If `requires_confirmation` is `true`, the system pauses, caches the plan in the shared `confirmationState`, and asks the user for explicit approval.
5.  **Execution Phase**: Node actions (e.g., `serp_api_search`) execute inline. Browser actions are forwarded to the Python Agent. Every step records a success/failure snapshot in `taskTracker.ts`. The `safe_click` pipeline handles retries and fallback methods transparently.
6.  **Output Phase**: Final success confirmation is returned to the Node backend, which uses TTS to respond back to the React UI asynchronously.

