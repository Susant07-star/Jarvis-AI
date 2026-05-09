# J.A.R.V.I.S. Development Roadmap

> **Architecture Contract**: This roadmap strictly adheres to the rules in `project_docs/BOOTSTRAP_PROMPT.md`.
> - The LLM **never** executes tools directly. All execution flows through Node.js → Python Agent.
> - The Planner outputs **strict JSON only** (`{"requires_confirmation": bool, "steps": []}`).
> - The Orchestrator in `server/` is the central control system.

---

## Phase 1: Core Local Automation ✅ (Stable)

**Goal**: Establish a reliable, observable local browser agent that can execute structured tasks on a real browser session.

### 1.1 Browser Automation (Visual Agent & Coordinate Engine)
- [x] **Set-of-Mark Visual Engine** — `python_agent/youtube_agent.py`
  - Injects JS to draw numbered bounding boxes over all interactive elements.
  - Takes Base64 screenshots of the UI.
  - Maps `jarvis_id` (box numbers) directly to precise `center_x`, `center_y` coordinates.
- [x] **Secure Form Filling** — `type_secure` action
  - Credential keys resolved from environment variables; plaintext never logged
- [x] **Ad Skipping**
  - Poll for `ytp-ad-skip-button` visibility; click when available.

### 1.2 API Integration
- [x] **Deep Research / Intelligent Search** — routed inline in `server/routes/api.ts` & `server/llmRouter.ts`
  - Uses `gemini-3.1-flash-lite-preview` with Google Search Grounding for live research.
  - Features dynamic API Key rotation (up to total keys configured) to prevent quota exhaustion.
  - Falls back to `gemini-2.5-flash` and `gemini-2.0-flash`.

### 1.3 Observability & Metrics
- [x] **MetricsTracker** — `server/utils/metrics.ts`
  - Tracks token usage, latency, and model selection.
- [x] **Debug Logging**
  - Screenshots dynamically saved to `logs/debug_screenshots/` without blocking the Node event loop.
  - Detailed token usage and agent plans saved to `logs/debug.log`.

---

## Phase 2: Telegram & Remote Voice (CURRENT PRIORITY 🔴)

**Goal**: Allow J.A.R.V.I.S. to be controlled remotely via Telegram (text + voice) and integrate audio calling directly to Gemini.

### 2.1 Telegram Integration (Must-Have) ✅
- [x] **Text & Voice Command Bridge** — `server/telegramBot.ts`
  - [x] Custom Manual Polling Loop with DNS-bypass.
  - [x] Groq Whisper STT for transcribing voice notes.
  - [x] Text messages routed through unified Intent Classifier.
- [x] **Telegram Audio Calling to Gemini** — `src/components/jarvis/TelegramCallUI.tsx`
  - [x] Implemented Telegram Web App (Mini App) for mobile voice calling.
  - [x] Full 3D Zoya Avatar integration on phone screen.
  - [x] Direct WebRTC/Microphone stream to Gemini Live WebSocket.
- [x] **Proactive Notifications & Voice Reminders**
  - [x] Implemented `triggerProactiveCall` backend endpoint.
  - [x] JARVIS can autonomously send a "Join Call" button to the user when tasks finish.

### 2.2 Advanced Intelligence & File Generation (Must-Have)
- **Dropdown Thinking (Reasoning UI)**
  - Implement collapsible "Thinking..." dropdown in React Chat and Telegram.
  - Show internal planning and research progress live before final answer.
- **Deep Research Engine**
  - Expand Intelligent Search to perform multi-step, deep-dive research tasks autonomously.
- **File Making & PDF Generation**
  - Node `fs` module to generate well-formatted PDFs, Markdown reports, or CSVs based on LLM outputs.
  - Automatically send generated PDFs back to the user via Telegram.
- **Video Message Support**
  - Extract audio from Telegram video messages (`.mp4`) and process them like voice notes.
  - Explore Gemini Vision for direct visual analysis of video clips.

### 2.3 Robust Persistence & Scheduling (Next Steps)
- **Supabase/Postgres Persistence Layer**
  - Migrate the Neural Scheduler from in-memory `setTimeout` to a persistent Supabase database.
  - Ensures scheduled tasks (reminders, callbacks) survive server restarts or Render's free-tier sleep cycles.
- **External Webhook Trigger (QStash/Cron)**
  - Implement a serverless queuing system (e.g., Upstash QStash) to hit the backend webhook at the exact scheduled time, guaranteeing delivery without active RAM consumption.

---

## Phase 3: Advanced Browser Automation (SECOND PRIORITY 🟡)

**Goal**: Polish and scale the autonomous Multi-Modal Set-of-Mark browser agent.

### 3.1 Multi-Agent Architecture
- **Task Priority Queue**
  - Node maintains an ordered queue of pending browser tasks.
- **Parallel Execution** *(optional)*
  - Spawn multiple Python agent processes for concurrent tab automation.

### 3.2 Complex Visual Navigation
- **Scrolling & Context Memory**
  - Teach the visual agent to scroll to find elements off-screen and remember their state.
- **CAPTCHA & Anti-Bot Evasion**
  - Implement strategies for navigating complex, bot-protected environments.

---

## Phase 4: Voice Interaction & Advanced UX

**Goal**: Make J.A.R.V.I.S. feel like a real conversational assistant with natural voice UX across all devices.

### 4.1 Real-Time Task Handling
- Live progress updates streamed during multi-step execution.
- Interruption support: user can say "stop" mid-execution → `AbortController` signal fires.

---

## Cross-Phase Enhancements (Ongoing)

These apply across **all phases** and should be maintained continuously.

### Observability
| What | Where | Status |
|---|---|---|
| Token usage per request | `metrics.ts` → `logs/token_detailed.json` | ✅ Active |
| Dynamic Key Rotation | `llmRouter.ts` | ✅ Active |
| Visual Agent Screenshots | `planner.ts` → `logs/debug_screenshots/` | ✅ Active |

*Last Updated: 2026-05-09 | Phase 2.1 Complete. Telegram Audio Calling + Static Domain implemented.*
