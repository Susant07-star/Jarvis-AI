# BOOTSTRAP_PROMPT

## 1. PROJECT OVERVIEW
J.A.R.V.I.S. is an advanced AI assistant system equipped with intelligent browser automation. Its primary goal is to provide a seamless conversational interface while retaining the capability to autonomously browse, navigate, and perform tasks on the web. The system is currently running as a **v1 controlled agent system**, featuring sophisticated LLM orchestration.

## 2. SYSTEM ARCHITECTURE
The system operates across three main layers:
- **React Frontend:** The user-facing interface handling UI rendering and real-time voice/text input.
- **Node.js Backend:** The central "brain" and orchestrator. It listens via WebSockets, parses intents, summarizes memory, plans browser tasks, and controls agent execution.
- **Python Playwright Agent:** The execution layer that interacts directly with the browser DOM, executing actions defined by the Node backend.

**Execution Flow:**
User → Orchestrator → Mode (Direct vs. Agent) → Planner → Agent → Result

## 3. CORE DESIGN RULES (VERY IMPORTANT)
- **LLMs must NEVER directly execute tools.** They only output task plans.
- **All tool execution must go through the Node backend layer.**
- **The Planner must ONLY output valid JSON.** No XML, HTML, or conversational text is permitted in planner output.
- **Planner Fallback:** If a plan cannot be formulated, the Planner must return a structured error message (`{"success": false, "action": "planner", ...}`).
- **No `<function>` tags or unstructured external tool calls.**
- **The Orchestrator is the central control system.** Never bypass it.
- **Prompt Trimming:** The system dynamically prunes the DOM elements to fit within `max_tokens_hint` to prevent context window overflow.

## 4. SYSTEM MODES
- **Direct Mode:** Used for simple conversational queries, Q&A, or idle chatter. It provides fast, direct LLM responses directly back to the user without attempting browser execution.
- **Agent Mode:** Used for browser or multi-step physical tasks. It uses a structured LLM Planner working with the Python Playwright agent to execute commands.

## 5. CURRENT FEATURES
- Chat system & Voice pipeline (WebSocket + Wake/Sleep state machine)
- Orchestrator (Intent routing & Shared Confirmation Gateway for sensitive ops)
- Planner (Strict JSON-based generation with `requires_confirmation` flagging and `internal_steps` reasoning)
- Browser automation (Safe Click pipeline, advanced YouTube actions, SerpAPI integration via Python/Node)
- Secure credential management (`type_secure`)
- Logging system & Token/Latency tracking (`metrics.ts` → `logs/token_detailed.json`)
- Documentation update system (Automated `CHANGELOG.md` and `SYSTEM_STATUS.md` updates)
- Log Rotation (`logs/rotate_logs.ps1`)

## 6. KNOWN ISSUES
- Viewport syncing: The Selenium browser does not dynamically match the React frontend UI pane size.
- Tab management indexing bugs.

## 7. PROJECT STRUCTURE
- `src/` → Frontend React code and UI components
- `server/` → Backend Node.js logic and orchestrator pipelines
- `python_agent/` → Python Playwright execution layer for Web automation
- `logs/` → Metrics, debugging logs, CSV reports, and token trackers
- `project_docs/` → Documentation (including this file, architectures, and statuses)

## 8. HOW TO EXTEND THE SYSTEM
- **Add new agent capability:** Create the underlying function within the Python execution layer.
- **Add new capability to JARVIS:** Update the Planner prompts to understand the new action, and ensure the Orchestrator supports it.
- **Modify behavioral routing:** Adjust Orchestrator logic and `intentClassifier.ts`.

## 9. DEVELOPMENT RULES
- **Always update `CHANGELOG.md`** after implementing a feature or fix.
- **Always maintain `SYSTEM_STATUS.md`** with accurate application states.
- **Never bypass the orchestrator** for new pipelines.
- **Keep modules decoupled.**

## 10. HOW TO START WORK (FOR NEW AI)
## 10. HOW TO START WORK (FOR NEW AI OR DEVELOPER)
1. Read this `BOOTSTRAP_PROMPT.md` file first in its entirety.
2. Read `project_docs/ARCHITECTURE.md` and `project_docs/ROADMAP.md` next to understand the system state.
3. **If debugging a broken feature**, ALWAYS read `project_docs/DEBUGGING.md` and the bottom of `logs/debug.log` first.
4. **Do NOT redesign the system randomly.** Fix issues by adhering to existing architectural patterns.
5. Follow existing conventions, use the tools provided appropriately, and ensure the rules defined here are strictly preserved.
