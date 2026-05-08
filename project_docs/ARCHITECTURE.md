# J.A.R.V.I.S. Architecture Documentation

## 1. Frontend Layer (React / Vite)
Located in `src/`. The user interface is a responsive, glassmorphism-styled dashboard. 
*   **ChatWindow.tsx**: Displays SSE-streamed messages from the Node backend. Includes positive/negative feedback logging buttons.
*   **VoiceVisualizer.tsx**: Provides visual feedback for voice pipeline state (`listening`, `processing`, `speaking`).
*   **useJarvisVoice.ts**: A custom React Hook that captures raw PCM mic data via an `AudioWorklet`.

## 2. Backend Brain (Node.js / Express)
Located in `server/`. This is the core cognitive routing layer.
*   **Orchestrator**: The incoming command (from `api.ts` or `websocket.ts`) is routed through `jarvisBridge.ts` into an Intent Classifier.
*   **Visual Planner (`planner.ts`)**: 
    - **Multi-Modal Set-of-Mark (SoM)**: Instead of reading raw DOM code, the planner now uses the Python Agent to capture a marked-up screenshot of the browser.
    - **Vision-Led Planning**: The planner sends the Base64 screenshot and a numerical element map to Gemini's vision engine. Gemini "sees" the UI and identifies elements by their red-boxed ID numbers (`jarvis_id`).
*   **Cascading Brain (`llmRouter.ts`)**: 
    - **Provider Priority**:
        - **Primary**: `gemini-3.1-flash-lite-preview` (Fastest, Vision-capable, High Quota).
        - **Secondary**: `gemini-2.5-flash` (High Reasoning, Vision-capable).
        - **Tertiary**: `gemini-2.0-flash` (Legacy).
    - **Dynamic Key Rotation**: Automatically counts the number of keys in the `.env` file (via `getKeyCount`) and rotates through all of them randomly on 429 errors before falling back to the next model.
*   **Observability (`metrics.ts`)**: Tracks per-request token usage and latency. 
*   **Debug HUD**: Base64 screenshots are saved asynchronously to `logs/debug_screenshots/` for visual verification of what the AI saw during planning.

## 3. Executor Engine (Python / Selenium)
Located in `python_agent/`. This is the "hands" and "eyes" of the system.
*   **youtube_agent.py**: A FastAPI server wrapped around an ongoing Selenium session.
*   **Visual Engine (`/mark-page`)**: 
    - Injects a specialized JavaScript payload (`MARKER_JS`) that identifies all interactive elements.
    - Draws red bounding boxes and numerical tags over every element on the screen.
    - Captures a Base64 screenshot and returns it to Node alongside a coordinate map.
    - Automatically cleans up the markers instantly after capture to avoid UI pollution.
*   **Coordinate-Based Safe Click**: 
    - Since the visual agent works with pixel-perfect screenshots, the click engine now supports direct coordinate clicking.
    - Maps the `jarvis_id` (box number) from the planner back to its precise `center_x`, `center_y` pixels.
    - Performs the click using Selenium's ActionChains or direct JS `elementFromPoint` events.

## 4. Data Flow (Input → Orchestrator → Execution)
1.  **Input Phase**: User speaks or types a message.
2.  **Orchestrator Phase**: `jarvisBridge.ts` unifies input and classifies intent.
3.  **Visual Extraction**: Node calls Python's `/mark-page`. Python marks the UI, grabs a screenshot, and sends the Base64 image + coordinate map back to Node.
4.  **Planning Phase**: `planner.ts` sends the user goal + Base64 screenshot to Gemini 3.1 Flash Lite.
5.  **Execution Phase**: Gemini returns a JSON plan like `{"action": "click", "jarvis_id": 14}`. Python receives this, looks up the coordinates for box 14, and performs a pixel-perfect click.
6.  **Verification Phase**: Success/Failure is logged to `debug.log` and the screenshot is archived for debugging.

## 5. Intelligence & Knowledge (Research)
*   **Intelligent Search**: A dedicated tool in `llmRouter.ts` that uses Google Search Grounding.
*   **Multi-Model Fallback**: If Gemini 3.1 hits a quota, it rotates keys. If all keys fail, it falls back to 2.5 Flash and then 2.0 Flash to ensure the search always succeeds.

*Last Updated: 2026-05-08 | Transitioned to Visual Set-of-Mark Architecture.*
