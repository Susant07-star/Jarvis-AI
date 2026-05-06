# J.A.R.V.I.S. Project Instructions & Developer Guidelines

> **🚨 CRITICAL NOTICE FOR ALL FUTURE AI AGENTS OR HUMAN DEVELOPERS 🚨**
> **TOKEN OPTIMIZATION IS MISSION CRITICAL.**
> J.A.R.V.I.S. is designed to be blazing fast and highly token-efficient. Read and follow the Token Optimization Rules below BEFORE making any changes to prompt architecture or agent behavior.

## Core Architecture & Architecture

This file acts as the **Single Source of Truth** for all developers and AI agents working on J.A.R.V.I.S.

## The Phased Roadmap
J.A.R.V.I.S is being built in three distinct phases. 

### ✅ Phase 1: Stabilize Locally (CURRENT FOCUS)
**Goal:** Make everything work perfectly on a single local machine (laptop/PC).
**Instructions for Developers/AI:**
* SIMPLIFY SETUP: Do not introduce complex cloud, Docker, or ngrok tunneling logic yet.
* All components (Node.js backend, React frontend, Python agent) run locally via localhost.
* **Core Flow Test:** 
  1. Start Python Agent (`cd python_agent && python youtube_agent.py`)
  2. Start Node Backend/Frontend (`npm run dev`)
  3.* Wait for TTS -> Stream TTS via WebSocket -> Play audio -> Repeat seamlessly.
* **Success Criteria:** The flow is sub-second latency and feels indistinguishable from a native desktop application. Code is completely free of Google Cloud or paid dependencies (except Groq).

## Security
Ensure all secrets are stored in `.env.local` and never tracked in git. Handle sensitive voice input securely.

---

## 🛑 STRICT TOKEN OPTIMIZATION RULES FOR FUTURE DEVELOPERS 🛑

To keep J.A.R.V.I.S. affordable and fast (using Groq API), you MUST adhere to the following rules when expanding the system:

### 1. Maintain the Modular Prompt Architecture
- **DO NOT** paste massive blocks of instructions directly into `websocket.ts` or `api.ts`.
- All agent instructions MUST be stored in `server/agent_prompts/modules/`.
- Use `buildPrompt(agentName)` to assemble ONLY the modules needed for that specific request.
- *Voice agents should not receive browser DOM rules. Vision agents should not receive mouse clicking tutorials.*

### 2. Move Examples & Metadata Offline
- **DO NOT** send dozens of examples to the LLM. 
- Put extended examples, reasoning processes, and tool documentation in the `_doc` or `_reference_full_rules` JSON comments inside the `agent_prompts/modules/` files.
- The LLM only needs the exact rule (e.g., `- "search X" -> use search_site`). The developer needs the docs.

### 3. Dynamic Prompt Assembly & Summarization
- For multi-step actions (e.g., searching, listing results, clicking), **summarize** intermediate steps.
- Do not dump 100-line DOM responses back into the context blindly. Use `analyze_page` carefully, and limit extraction to visible, interactive elements only (current limit: 80 elements).
- `server/llm.ts` handles memory summarization. Maintain this — don't let the context window stretch to 8,000 tokens for a simple "Click Next" command.

### 4. Monitor Token Budgets
- Token usage is actively logged via `[Token Metrics]` in the Node console.
- If you add a feature and the base Request Prompt size exceeds **500 tokens**, you are doing it wrong. Refactor it into a sub-agent or a smaller module.

### 🌐 Phase 2: Cloud JARVIS (Without Laptop)
**Goal:** Deploy the "Brain" to the cloud (Render) so J.A.R.V.I.S is always available.
* Node/React frontend will be moved to Render Free Version.
* Chat, reminders, Gmail interaction, and standard LLM features will function 24/7.
* **Limitation:** YouTube/Desktop automation will be disabled when the local laptop is off.

### 🔥 Phase 3: Make JARVIS Usable Anywhere (Telegram)
**Goal:** Connect to J.A.R.V.I.S on the go.
* Build a Telegram bot integration to message JARVIS from your phone to check emails, set reminders, and query knowledge instantly.
* When at home (PC ON): Full power mode (YouTube, apps, automation).

---

## Technical Architecture & Developer Rules

### 1. System Structure
* **Frontend (React/Vite):** Visual HUD.
* **Backend Origin (Node.js/TypeScript):** Connects to Groq tools/websockets. Routes automation to Python via HTTP POST (`http://localhost:8000/execute`).
* **Microservices (Python):** Contains `youtube_agent.py` using `undetected-chromedriver` for native action.

### 2. Development Rules
* **No Mixed State:** Python holds browser state. Node.js holds conversation UI state. Keep them isolated.
* **Async by Default:** Any command POSTed to the Python agent (`/execute`) must run in a `BackgroundTask` (FastAPI) and return immediately so Node.js socket streams don't hang.
* **API Key Rotation:** We use multiple Groq keys in `process.env.GROQ_API_KEY` (comma-separated) to maintain stability in Phase 1.
