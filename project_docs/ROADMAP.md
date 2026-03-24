# J.A.R.V.I.S. Development Roadmap

> **Architecture Contract**: This roadmap strictly adheres to the rules in `project_docs/BOOTSTRAP_PROMPT.md`.
> - The LLM **never** executes tools directly. All execution flows through Node.js → Python Agent.
> - The Planner outputs **strict JSON only** (`{"requires_confirmation": bool, "steps": []}`).
> - The Orchestrator in `server/` is the central control system.

---

## Phase 1: Core Local Automation ✅ (Stable)

**Goal**: Establish a reliable, observable local browser agent that can execute structured tasks on a real browser session.

### 1.1 Browser Automation
- [x] **DOM Extraction** — `python_agent/youtube_agent.py`
  - Unified `{elements: [{id, text, role, selector, xpath}]}` array via injected JS
  - Global DOM cache (`last_extracted_elements`) for smart element matching
- [x] **`safe_click` Pipeline** — `python_agent/youtube_agent.py`
  - Fallback order: `jarvis_id` → CSS selector → XPath → text similarity
  - Retry up to 3×: standard click → JS click → ActionChains
  - Post-action verification (URL change or DOM state change)
- [x] **YouTube Actions**
  - `youtube_like`, `youtube_subscribe`, `youtube_comment`
  - Targeted selectors: `ytd-subscribe-button-renderer`, `ytd-comment-simplebox-renderer`
- [x] **Secure Form Filling** — `type_secure` action
  - Credential keys resolved from environment variables; plaintext never logged
- [x] **Ad Skipping**
  - Poll for `ytp-ad-skip-button` visibility; click when available.

### 1.2 API Integration
- [x] **SerpAPI Search** — routed inline in `server/routes/api.ts` & `server/websocket.ts`
  - `serp_api_search` action executes in Node (no Python round-trip)
  - Token usage tracked via `MetricsTracker` (+50 per query estimate)
- [ ] **Email Sending** *(optional, Phase 1 extension)*
  - Add a `send_email` Node action (SMTP/SendGrid)
  - Planner must flag `requires_confirmation: true` for any outbound email
- [x] **Token-Efficient DOM Payloads**
  - Dynamic DOM pruning implemented to maintain `max_tokens_hint` compliance.

### 1.3 Observability & Metrics
- [x] **MetricsTracker** — `server/utils/metrics.ts`
  - Tracks: classifier tokens, planner tokens, direct tokens, DOM tokens, SerpAPI tokens, latency
  - Appends structured JSON entries to `logs/token_detailed.json`
- [x] **Documentation Automation** — `server/utils/docUpdater.ts`
  - `updateDocs(type, message)` → writes to `CHANGELOG.md` + `SYSTEM_STATUS.md`
  - `verifyDocIntegrity()` warns if code changed without doc update
- [x] **Execution Success/Failure Logging**
  - `ACTION RESULT: {"success": bool, "action": "...", "target": "...", "details": "..."}` already emitted.
  - Ensure failures roll up into the MetricsTracker finalize call

---

## Phase 2: Multi-Device & Remote Control

**Goal**: Allow J.A.R.V.I.S. to be controlled remotely via Telegram (text + voice) and manage local/cloud files.

**Dependencies**: Phase 1 stable ✅ (Milestone Reached 2026-03-24)

### 2.1 Telegram Integration *(must-have)*
- **Text Command Bridge**
  - Telegram Bot polls for user messages → forwards to Node `/chat` endpoint
  - Responses streamed back as Telegram messages (chunked if long)
- **Voice Command Bridge**
  - Users send voice notes → Node transcribes via Groq Whisper → routes through WebSocket pipeline
- **Scheduled Tasks** *(optional)*
  - Node cron (e.g., `node-cron`) schedules recurring Planner tasks
  - Example: "Every morning at 8am, search AI news and send summary to Telegram"
- **Confirmation via Telegram**
  - When `requires_confirmation: true`, send an inline button (Yes/No) to Telegram
  - On reply, resume or cancel the cached pending plan

> **Relevant files**: `server/websocket.ts`, `server/routes/api.ts`, `server/utils/metrics.ts`

### 2.2 Multi-Agent Architecture *(phase-dependent)*
- **Task Priority Queue**
  - Node maintains an ordered queue of pending tasks
  - High-priority tasks (user-initiated) pre-empt background scheduled jobs
- **Parallel Execution** *(optional)*
  - Spawn multiple Python agent processes for concurrent tab automation
  - Each agent instance owns its own Chrome profile dir
- **Shared Memory** *(optional)*
  - Agents share `last_extracted_elements` via Redis or a simple in-memory store in Node

### 2.3 Local & Cloud File Management *(must-have)*
- **Local File Access**
  - Node `fs` module reads/writes files on `C:`, `D:`, `E:` drives
  - Add `read_file` and `write_file` Planner actions
  - Planner must set `requires_confirmation: true` for any write/delete
- **File Generation**
  - LLM drafts file content (reports, markdown, CSV) → Node saves to disk
  - Example: "Create a summary report from today's SerpAPI results"
- **Cloud Upload** *(optional)*
  - After generating a file, optionally sync to Google Drive or OneDrive via API

---

## Phase 3: Intelligence & Knowledge

**Goal**: Enable J.A.R.V.I.S. to proactively retrieve, summarize, and present structured knowledge.

**Dependencies**: Phase 2 Telegram bridge

### 3.1 Web Search & Summarization *(must-have)*
- **AI News Digest**
  - SerpAPI or direct Google/Bing search for "AI news today"
  - LLM summarizes top-5 results into bullet points (≤400 tokens)
  - Planner action: `serp_api_search` → `summarize_results`
- **Stock/Finance Alerts** *(optional)*
  - Poll a finance API (e.g., Yahoo Finance) for user-defined tickers
  - Alert via Telegram if threshold price crossed
- **General Knowledge Q&A**
  - If intent is `direct` but references factual data → trigger search before answering
  - Reduces hallucination on time-sensitive questions

### 3.2 Multi-Agent Data Retrieval *(optional)*
- Spawn sub-agents for parallel topic searches
- Merge responses in Node before LLM summarization
- Example: "Research top 5 AI papers this week" → 5 parallel SerpAPI calls → single merged summary

### 3.3 Proactive Intelligence *(optional)*
- Daily 8am briefing: weather + AI news + calendar summary → Telegram/TTS
- Triggered by Node `node-cron` scheduler from Phase 2
- Requires user opt-in and explicit scheduling configuration

### 3.4 Visually Aware DOM Agent (Viewport Mapping) *(Planned)*
- **Problem**: Sending massive HTML DOM payloads to LLMs consumes tokens rapidly.
- **Solution**: Inject JS to detect `window.innerHeight` and strip everything outside the active view.
- **Workflow**:
  1. Strip all non-interactive UI (`<div>`, `<span>`, tracking pixels).
  2. Compress remaining `<button>`, `<a>`, `<input>` elements into a mapped Markdown list: `[ID:3] BUTTON: 'Play Video'`.
  3. Pre-inject this 50-token map into the orchestrated LLM's system prompt prior to generating execution plans.
- **Result**: "Zero-shot" clicking based on relative spatial awareness inside the browser.

---

## Phase 4: Voice Interaction & Advanced UX

**Goal**: Make J.A.R.V.I.S. feel like a real conversational assistant with natural voice UX.

**Dependencies**: Phase 1 WebSocket pipeline ✅

### 4.1 Voice Input *(must-have — partially complete)*
- [x] **Web Interface**: `AudioWorklet` + `SpeechRecognition` → Groq Whisper STT
- [ ] **Telegram Voice Notes**: Voice note OGG → convert → Groq Whisper STT
- [ ] **Wake Word Detection** *(optional)*: Local `picovoice` / `pvporcupine` wake-word engine
  - On "Hey Jarvis" → begin recording session automatically

### 4.2 TTS Responses *(must-have — partially complete)*
- [x] ElevenLabs / OpenAI TTS for web interface
- [ ] Telegram TTS: Generate audio file → send as Telegram voice message

### 4.3 Real-Time Task Handling
- Live progress updates streamed during multi-step execution
  - Each step emits `type: 'llm_chunk'` with current action description
- Interruption support: user can say "stop" mid-execution → `AbortController` signal fires
- Example flow: "Play top AI video on YouTube" → JARVIS narrates each step live

---

## Phase 5: Security & Controlled Automation

**Goal**: Ensure all sensitive or destructive actions require explicit user authorization.

**Dependencies**: All prior phases

### 5.1 Encrypted Credential Handling *(must-have — partially complete)*
- [x] `type_secure` action reads from environment variables (mock encryption layer)
- [ ] **Full AES-256-GCM encryption** *(must-have)*
  - Store credentials in an encrypted local `.vault` file
  - Node decrypts at runtime using a master passphrase (never stored or logged)
  - Python agent receives only the decrypted ephemeral string, never the key

### 5.2 Planner-Enforced Confirmation *(must-have — complete)*
- [x] `requires_confirmation: true` for: `youtube_like`, `youtube_subscribe`, `youtube_comment`, `type_secure`, or > 3 steps
- [x] Confirmation gates in `api.ts` and `websocket.ts`
- [ ] **Confirmation via Telegram inline buttons** (Phase 2 dependency)
- [ ] **Audit Log** *(optional)*
  - Every confirmed action appended to `logs/audit.json` with timestamp, goal, and user ID

### 5.3 Rate Limiting & Abuse Prevention *(optional)*
- Node rate-limiter middleware on `/chat` and WebSocket endpoints
- Max N browser actions per minute per session
- Automatic cooldown after consecutive failures

---

## Cross-Phase Enhancements (Ongoing)

These apply across **all phases** and should be maintained continuously.

### Observability
| What | Where | Status |
|---|---|---|
| Token usage per request | `metrics.ts` → `logs/token_detailed.json` | ✅ Active |
| Latency tracking (classify, plan, execute) | `metrics.ts` | ✅ Active |
| Action result logging (`ACTION RESULT: {...}`) | `youtube_agent.py` | ✅ Active |
| Execution failure roll-up | `metrics.ts` + `taskTracker.ts` | 🔲 Partial |

### Documentation Automation
| What | Where | Status |
|---|---|---|
| CHANGELOG.md auto-update | `docUpdater.ts` → `updateDocs()` | ✅ Active |
| SYSTEM_STATUS.md timestamp | `docUpdater.ts` | ✅ Active |
| Doc integrity check | `docUpdater.ts` → `verifyDocIntegrity()` | ✅ Active |
| Architecture sync | `ARCHITECTURE.md` (manual) | ✅ Up to date |

### Modularity
- Each Phase is independently deployable — later phases add modules without breaking earlier ones
- All new Planner actions follow the same JSON contract: `{"action": "...", "jarvis_id"?: N, "query"?: "...", "text"?: "..."}`
- All new Python actions are registered in the `execute_single_command` dispatch table
- All new Node actions are filtered from browser commands before Python relay

---

*Last Updated: 2026-03-24 | Generated from current ARCHITECTURE.md, BOOTSTRAP_PROMPT.md, and implementation state.*
