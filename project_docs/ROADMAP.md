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

### 2.1 Telegram Integration (Must-Have)
- **Text Command Bridge**
  - Telegram Bot polls for user messages → forwards to Node `/chat` endpoint.
  - Responses streamed back as Telegram messages.
- **Telegram Audio Calling to Gemini** *(High Priority)*
  - Establish WebRTC or Telegram Voice Call integration.
  - Stream Telegram audio directly to the Gemini Live WebSocket.
  - Allow real-time voice conversations through the Telegram app.
- **Confirmation via Telegram**
  - When `requires_confirmation: true`, send an inline button (Yes/No) to Telegram.
- **Dropdown Thinking (Reasoning UI)** *(New Priority)*
  - Implement a collapsible "Thinking..." dropdown in the React Chat and Telegram.
  - Show the AI's internal steps, planning logic, and research progress live before the final answer.

### 2.2 Advanced Intelligence & File Generation (Must-Have)
- **Deep Research Engine**
  - Expand Intelligent Search to perform multi-step, deep-dive research tasks autonomously.
- **File Making & PDF Generation**
  - Node `fs` module to generate well-formatted PDFs, Markdown reports, or CSVs based on LLM outputs.
  - Automatically send generated PDFs back to the user via Telegram.

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

*Last Updated: 2026-05-08 | Priorities shifted to Telegram/Audio Calling and PDF generation.*
