# J.A.R.V.I.S. System Status

## Quick Links
- **Architecture**: `project_docs/ARCHITECTURE.md`
- **Roadmap**: `project_docs/ROADMAP.md`
- **Debugging Guide**: `project_docs/DEBUGGING.md`
- **Changelog**: `project_docs/CHANGELOG.md`

## Current Features Implemented
*   **Set-of-Mark (SoM) Visual Agent**: JARVIS now "sees" the browser. It injects numbered bounding boxes over the UI and uses Gemini's vision engine to plan actions.
*   **Pixel-Perfect Coordinate Engine**: Browser interactions are now based on precise X,Y coordinates mapped from the visual bounding boxes, eliminating CSS selector fragility.
*   **Dynamic API Key Rotation**: The system now counts available keys in `.env` and automatically rotates/retries through all of them on 429 errors before cascading to fallback models.
*   **Non-Blocking Debug HUD**: Visual screenshots of every planning turn are saved to `logs/debug_screenshots/` asynchronously, ensuring zero impact on system latency.
*   **Unified Memory Bridge**: Chat and Voice share a real-time 20-message memory window via `session_memory.json`.
*   **Intelligence Cascade**: `llmRouter.ts` prioritizes Gemini 3.1 Flash-Lite with 2.5 Flash as a fallback for high-quality reasoning.

## Working Components
*   **Visual Planner**: Multi-modal planning using Base64 screenshot payloads.
*   **Research API**: Google Search Grounding with 3-model fallback and key rotation.
*   **Zoya Voice (V2)**: Gemini 3.1 Flash Live voice interface with 24kHz audio.
*   **YouTube Ad Watcher**: Background thread that skips ads autonomously.

## Recent Fixes (2026-05-08)
*   **KEY ROTATION FIXED**: `llmRouter.ts` now uses `getKeyCount()` to dynamically scale retries based on your `.env` configuration.
*   **RESEARCH FALLBACK STABILIZED**: Fixed 404/Quota errors in Intelligent Search by routing through 3.1 Flash Lite and 2.5 Flash with separate quota pools.
*   **WINDOWS EMOJI CRASH FIXED**: Removed emoji characters from terminal print statements in test scripts to prevent Windows encoding crashes.
*   **VISUAL AGENT IMPLEMENTED**: Replaced old DOM-parsing `planWithDOM` with the modern `planWithVisualAgent` using Set-of-Mark screenshots.

## Current Priorities (Roadmap Shift)
1.  **Telegram Integration**: Text and Voice bridge for remote control.
2.  **Audio Calling**: Real-time voice calls from Telegram to Gemini.
3.  **Dropdown Thinking**: Collapsible reasoning UI for Chat and Telegram.
4.  **File Generation**: PDF/Markdown/CSV report generation.
5.  **Deep Research**: Enhanced multi-step web research.
6.  **Browser Agent Optimization**: Scaling and polishing the SoM engine.

*Last Update: 2026-05-08 | Visual Agent Implementation & Key Rotation Stabilization.*
