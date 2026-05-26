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
- [ ] **Universal Watchdog Tooling**
  - Generalize the alarm watchdog into a flexible agent tool (`schedule_watchdog`).
  - Enable J.A.R.V.I.S. to monitor any background task, specifying custom check intervals (gaps), conditions, and retry limits.

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

### 3.3 Autonomous Log Analyzer & Fail-Safe Injection
- **Real-Time Log Monitor**
  - Run a lightweight background process/LLM to monitor error logs and verify whether scheduled tasks/actions executed successfully.
- **Fail-Safe Live/Chat Injection**
  - If a background task fails, J.A.R.V.I.S. automatically injects the error context into the live voice mode (Gemini Live) or active chat thread so the user is immediately notified.
- **Offline Issue Registry**
  - Write details about failed runs to a persistent `logs/debug_issues.json` file to make debugging offline simple.

---

## Phase 4: Security Hardening & Owner Authentication ✅ (Completed)

**Goal**: Harden J.A.R.V.I.S. access control to prevent unauthorized use, locking replies and system control solely to the primary administrator.

### 4.1 Owner Access Locking
- [x] **Telegram Admin Whitelist**
  - Restrict the Telegram bot listener to strictly reply only to verified user IDs (stored in env/database).
- [x] **3-Layer Security Lock**
  - **Layer 1:** Google OAuth integration natively via Supabase JS.
  - **Layer 2:** Cloud Identity Whitelist checking against `OWNER_EMAIL`.
  - **Layer 3:** 4-Digit Local Enclave Master PIN (required for both Web UI and I.R.I.S Vault).

### 4.2 Credentials & Encryption Isolation
- **Encrypted Local Enclaves**
  - Ensure all database tables and local thread logs containing personal data are fully AES-256 encrypted using runtime keys.
  - Mask dynamic credentials in system processes to ensure external inspection shows only sanitized data.

---

## Phase 5: Full Computer & OS Environment Control ✅ (Completed but final testing left)

**Goal**: Expand J.A.R.V.I.S. beyond the browser to orchestrate the entire host operating system.

### 5.1 Host OS Automation (I.R.I.S.) ✅
- [x] **I.R.I.S. Electron Daemon**
  - Integrated the I.R.I.S. daemon over a Cloudflare tunnel to execute physical actions on the host Windows machine.
- [x] **System Keyboard & Mouse Control**
  - Native control to click, type via clipboard injection, and press hotkeys using `@nut-tree-fork/nut-js`.
- [x] **Desktop App Control & Shell Execution**
  - Ability to open/close apps, capture base64 screenshots via `desktopCapturer`, and run PowerShell commands.

### 5.2 Next Steps for Local Environment
- [x] **I.R.I.S Daemon (Electron)**
  - [x] Implement `desktopCapturer` in `wormhole.ts` (or main process) to take screenshots every 1000ms.
  - [x] Implement a circular array holding the last 10 base64 frames.
  - [x] Add an endpoint (e.g., action `get_vision_buffer`) to the wormhole Express server so J.A.R.V.I.S can retrieve the frames.
- [x] **J.A.R.V.I.S Server (Backend)**
  - [x] Add `getVisionBuffer()` to `irisExecutor.ts` to request frames from I.R.I.S.
  - [x] Update `threadManager.ts` to fetch these frames when handling user messages and pass them into Gemini as inline image data.
- [x] **Cloudflare Tunnel Auto-Sync**
  - Use Supabase to automatically broadcast the changing Cloudflare tunnel URL from I.R.I.S. to J.A.R.V.I.S. on boot.

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

*Last Updated: 2026-05-24 | Phase 5 Complete. I.R.I.S. Host OS Automation is operational for now.*
