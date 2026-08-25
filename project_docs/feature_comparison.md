# J.A.R.V.I.S. Feature Comparison & Merge Strategy

This document compares the features in the two systems and defines a clear plan for what to keep, merge, and build.

---

## 🧠 The Two Systems Explained Simply

| System | Location | Role | Status |
|---|---|---|---|
| **JARVIS Web Server** | `e:\j.a.r.v.i.s.-web-interface\server\` | The "Brain" — LLM reasoning, Telegram, memory, scheduling, MCP | ✅ Production-ready |
| **JARVIS Desktop App** (was IRIS) | `e:\j.a.r.v.i.s.-web-interface\jarvis-desktop\` | The "Hands & Eyes" — PC control, local voice, UI | ✅ Functional, being rebranded |

**The answer to your question: You don't need to add features from one to the other — they are two different layers that work together. But some features in the Desktop App ARE duplicated or need to be connected to the Brain properly.**

---

## ✅ Features UNIQUE to the Desktop App (`jarvis-desktop`) — Keep & Polish

These are features the Desktop App has that the Web Server *cannot* do (because they require native OS access):

| Feature | File | Why it must be in Desktop |
|---|---|---|
| **Mouse & Keyboard Control** | `telekinesis.ts` | Requires `@nut-tree-fork/nut-js` native bindings |
| **Screen Capture / Vision** | `ghost-control.ts`, `ScreenPeeler-handler.ts` | Requires Electron desktop capturer |
| **Window Teleportation** | `telekinesis.ts` | Requires `node-window-manager` native |
| **App Launcher / Closer** | `app-launcher.ts` | Requires `child_process` shell on local OS |
| **Reality Hacker (DOM Injection)** | `reality-hacker.ts` | Requires Puppeteer running locally |
| **ADB / Phone Control** | `adb-manager.ts` | Requires local ADB binary |
| **Terminal Execution** | `terminal-control.ts` | Requires local shell |
| **Smart Drop Zones** | `SmartDropZone-Handler.ts` | Requires local file system |
| **Live Coding Widget** | `LiveCodingWidget.tsx` | Requires Monaco editor locally |
| **Workflow / Macro Editor** | `WorkFlowEditor.tsx` | Requires local execution |
| **Biometric Lock Screen** | `LockScreen.tsx` | Requires `face-api.js` + camera access |
| **Gallery Manager** | `gallery-manager.ts` | Requires local disk |
| **Notes Manager** | `notes-manager.ts` | Requires local disk |

---

## ✅ Features UNIQUE to the Web Server (`server/`) — Keep & Enhance

These are features the Web Server has that the Desktop App doesn't have yet:

| Feature | File | Description |
|---|---|---|
| **Telegram Bot** | `telegramBot.ts` | 24/7 chat interface via Telegram |
| **Agentic ReAct Loop** | `agenticLoop.ts` + `orchestrator.ts` | Multi-step autonomous reasoning |
| **LLM Router** | `llmRouter.ts` | Dynamically routes between Gemini, Groq, etc. |
| **MCP Manager** | `mcpManager.ts` | Manages Model Context Protocol servers |
| **Cron Job Scheduler** | `cronJobs.ts` + `scheduler.ts` | Schedule recurring tasks |
| **Log Portal (Real-time Logs)** | `logPortal.ts` | Streams live agent logs to the UI |
| **Supabase Memory** | `memory.ts` + `supabaseClient.ts` | Persistent semantic memory |
| **Butler Queue** | `butlerQueue.ts` | Proactive background task queue |
| **Intent Classifier** | `intentClassifier.ts` | Classifies user requests intelligently |
| **Knowledge Manager** | `knowledgeManager.ts` | RAG knowledge base management |
| **System Monitor** | `systemMonitor.ts` | PC CPU/RAM/battery telemetry |
| **Voice Enrollment** | `voiceEnrollmentCache.ts` | Speaker identification |
| **Thread Manager** | `threadManager.ts` | Multi-conversation context management |
| **Web Search** | `search.ts` | Tavily web search integration |

---

## ⚠️ DUPLICATED Features — Need to Merge Properly

These features exist in BOTH systems in different forms. We need to decide which version to use:

| Feature | Desktop Version | Server Version | Recommendation |
|---|---|---|---|
| **Voice AI** | `jarvis-voice-ai.ts` (Gemini Live WebRTC, local) | `voice_bridge.ts` + `websocket.ts` (server-side) | **Keep BOTH** — Desktop for real-time local voice, Server for Telegram voice |
| **Memory / Brain** | `jarvis-ai-brain.ts` (IPC → electron-store) | `memory.ts` (Supabase pgvector) | **Connect them** — Desktop should call Server's Supabase memory via API |
| **Web Research** | `deepSearch-rag.ts` (local Puppeteer) | `search.ts` (Tavily API) | **Keep both** — Tavily for quick searches, Puppeteer for deep research |
| **RAG / Knowledge** | `rag-oracle-tool.ts` (local vector DB) | `knowledgeManager.ts` (Supabase) | **Migrate** Desktop to use Server's Supabase-backed RAG |
| **Settings/Config** | `Settings.tsx` (reads from `.env` / electron-store) | `systemConfig.ts` (server `.env`) | **Consolidate** into the BYOK Onboarding flow (Phase 3 of our roadmap) |

---

## 🗺️ The Recommended Strategy

> **Do NOT rewrite anything. The Desktop App and the Web Server are two layers of the same product.**

### For Distribution (Phase 3 & 4 from our Roadmap):
1. **Package the Web Server *inside* the Electron app** as a background Node.js child process that the Desktop starts automatically on launch.
2. This means users only download ONE app (`Jarvis-Setup.exe`) but they get BOTH the beautiful UI and the full brain.
3. The Desktop UI talks to the local Web Server via `localhost:PORT`.

### What to Add to the Desktop App UI:
- [ ] **Logs View** — Stream real-time agent logs from the server's `logPortal.ts` into a dedicated Logs tab in the Desktop UI
- [ ] **MCP Hub** — A new Settings tab that maps to the server's `mcpManager.ts`
- [ ] **Scheduler View** — Show scheduled Cron jobs from `scheduler.ts`
- [ ] **Telegram Status** — Show if the Telegram bot is online/offline

### What NOT to worry about:
- Do not re-implement Telegram inside Electron — it lives in the Server layer
- Do not re-implement Supabase memory inside Electron — it lives in the Server layer
