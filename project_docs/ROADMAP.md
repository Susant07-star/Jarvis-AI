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

## Phase 2: Telegram & Remote Voice ✅ (Completed)

**Goal**: Allow J.A.R.V.I.S. to be controlled remotely via Telegram (text + voice) and integrate audio calling directly to Gemini.

### 2.1 Telegram Integration ✅
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

### 2.2 Robust Persistence & Scheduling
- [x] **Supabase/Postgres Persistence Layer**
  - [x] Implemented `jarvisScheduler.init()` on startup to query pending database tasks and resume active timers.
  - [x] Automatically saves scheduled tasks to Supabase and updates their status to `completed`/`failed`/`cancelled` on lifecycle events.
- [x] **Dynamic Task Cancellation & Modification**
  - [x] Enabled users to modify and cancel existing scheduled tasks via natural language, using active-task metadata injection in the LLM parser.
- [ ] **External Webhook Trigger (QStash/Cron)**
  - Implement a serverless queuing system (e.g., Upstash QStash) to hit the backend webhook at the exact scheduled time, guaranteeing delivery without active RAM consumption.
- [ ] **Recurring & Daily Schedules (Cron Work)**
  - Support syntax for repeating tasks (e.g., *"every day at 8:00 AM"*, *"every Sunday at 9:00 PM"*).
  - Automatically calculate the next execution time and reschedule the task after it runs successfully.

---

## Phase 3: Advanced Intelligence & Document Synthesis (CURRENT PRIORITY 🔴)

**Goal**: Power J.A.R.V.I.S. with complex document creation, deep reasoning traces, and multimodal media support.

### 3.1 Advanced Intelligence & Reasoning UI
- **Dropdown Thinking (Reasoning UI)**
  - Implement collapsible "Thinking..." dropdown in React Chat and Telegram.
  - Show internal planning and research progress live before final answer.
- **Deep Research Engine**
  - Expand Intelligent Search to perform multi-step, deep-dive research tasks autonomously.
- **Video Message Support**
  - Extract audio from Telegram video messages (`.mp4`) and process them like voice notes.
  - Explore Gemini Vision for direct visual analysis of video clips.

### 3.2 File Generation & Document Synthesis
- **File Making & PDF Generation**
  - Node `fs` module to generate well-formatted PDFs, Markdown reports, or CSVs based on LLM outputs.
  - Automatically send generated PDFs/CSVs back to the user via Telegram.

---

## Phase 4: Security Hardening & Owner Authentication (Third Priority 🔒)

**Goal**: Harden J.A.R.V.I.S. access control to prevent unauthorized use, locking replies and system control solely to the primary administrator.

### 4.1 Owner Access Locking
- **Telegram Admin Whitelist**
  - Restrict the Telegram bot listener to strictly reply only to verified user IDs (stored in env/database).
  - Silently ignore or send a warning to any unauthorized user attempting to message J.A.R.V.I.S.
- **Session Auth Keys**
  - Implement token-based query validation on the WebUI routes to prevent arbitrary access to the HUD dashboard.

### 4.2 Credentials & Encryption Isolation
- **Encrypted Local Enclaves**
  - Ensure all database tables and local thread logs containing personal data are fully AES-256 encrypted using runtime keys.
  - Mask dynamic credentials in system processes to ensure external inspection shows only sanitized data.

---

## Phase 5: Full Computer & OS Environment Control (Fourth Priority 🖥️)

**Goal**: Expand J.A.R.V.I.S. beyond the browser to orchestrate the entire host operating system.

### 5.1 Host OS Automation
- **System Keyboard & Mouse Control**
  - Integrate tools like PyAutoGUI or robotJS to click, type, and navigate desktop applications outside Chromium.
  - Allow J.A.R.V.I.S. to launch local apps, manage files, and interact with the host system directly.
- **File System Operations**
  - Enable native file creation, deletion, moving, and indexing across specified directories.

### 5.2 Local Environment Telemetry
- **Hardware Telemetry**
  - Expose system metrics (CPU, RAM usage, storage availability, active tasks) to J.A.R.V.I.S.'s tool context for diagnostic queries.
- **Environment Syncing**
  - Sync settings, bookmarks, and commands across physical desktop environments dynamically.

---

## Phase 6: Advanced Browser Automation (Fifth Priority 🟡)

**Goal**: Polish and scale the autonomous Multi-Modal Set-of-Mark browser agent.

### 6.1 Multi-Agent Architecture
- **Task Priority Queue**
  - Node maintains an ordered queue of pending browser tasks.
- **Parallel Execution** *(optional)*
  - Spawn multiple Python agent processes for concurrent tab automation.

### 6.2 Complex Visual Navigation
- **Scrolling & Context Memory**
  - Teach the visual agent to scroll to find elements off-screen and remember their state.
- **CAPTCHA & Anti-Bot Evasion**
  - Implement strategies for navigating complex, bot-protected environments.

---

## Phase 7: Voice Interaction & Advanced UX (Sixth Priority 🎙️)

**Goal**: Make J.A.R.V.I.S. feel like a real conversational assistant with natural voice UX across all devices.

### 7.1 Real-Time Task Handling
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

*Last Updated: 2026-05-19 | Phase 2 Complete. Telegram Bot, Web App Audio Calling, and Dynamic Task Scheduling/Modification fully operational.*
