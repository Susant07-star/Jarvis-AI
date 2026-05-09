# J.A.R.V.I.S. Technical Architecture

## 1. Conversational Intelligence Layer

### Stateful Thread Management (`ThreadManager.ts`)
We have moved away from stateless history transmission to a **Persistent, Disk-Based Thread System**.
- **Location**: `data/threads/{threadId}.json`
- **Benefit**: Reduces token overhead by ~80% by only sending necessary message deltas instead of the entire chat history in every request.
- **Persistence**: Conversation state survives server restarts and is shared across Web and Telegram.

### Modular Prompt Assembly (`prompt_builder.ts`)
The system uses a **"Soul vs. Skills"** architecture for system instructions.
- **Soul (`personality.json`)**: Defines the core identity (JARVIS, aristocratic, concise, Nepali-mirroring). Shared by ALL agents.
- **Skills (`voice_skills.json`, `tools_browser.json`, etc.)**: Adds capabilities specific to the medium (e.g., emotion tags for voice, DOM selectors for browser).
- **Integration**: The `buildPrompt()` function dynamically assembles these modules into a single optimized system instruction.

---

## 2. Neural Sync Bridge

### Shared Context API
The Frontend (Zoya Gemini Live) and Backend (Node.js/Telegram) are now synchronized via:
- **`GET /api/config/voice-prompt`**: Dynamically pulls the "Soul" from the server to ensure personality consistency.
- **`GET /api/session-context`**: Injects shared chat/voice history into the Gemini Live session so Zoya "remembers" what was said in text chat.

---

## 3. Input & Orchestration

### Intent Classification (`intentClassifier.ts`)
Uses a high-speed Llama-3-8B model to route requests:
- **Direct Mode**: Conversational, tone instructions, language shifts. (Routed to `callChatWithCascade`).
- **Agent Mode**: Physical browser tasks or deep research. (Routed to `planner.ts`).

### Multilingual Transcription
The Telegram transcription engine (Whisper) is configured for **Native Nepali/English Detection**.
- **Context Hinting**: Includes `Nepali, English, JARVIS, Susant` as prompt context to Whisper to ensure high accuracy for code-switching.
- **Language Lock**: Explicitly removed forced 'en' translation to allow native Nepali text processing.

---

## 4. UI/UX Protocols

### Conciseness Protocol
JARVIS is governed by a strict "Anti-Essay" rule. Responses are limited to 2-3 sentences unless "detailed analysis" is requested. This makes him feel like a human assistant rather than an LLM.

### Visual Status
- **Browser Badges**: Real-time token and model telemetry.
- **Search Success**: Clear `[SUCCESS]` indicators in logs for multi-model research cascades.
---

## 5. Telegram Remote Access Layer

### Telegram Web App (Mini App)
For mobile remote access, J.A.R.V.I.S. utilizes a **Telegram Web App Interface**.
- **Route**: `GET /telegram-call`
- **Bridge**: The Telegram bot provides a persistent "Call" button that opens this mobile-optimized route.
- **Voice Stack**: Integrates `ZoyaLiveService` via WebRTC/WebSockets directly inside the Telegram browser, bypassing bot-level audio limitations.
- **Aesthetics**: Automatically inherits Telegram's theme colors and expands to full-screen for an immersive 3D Avatar experience.
- **Ngrok Static Tunnels**: Uses fixed-domain ngrok tunnels to ensure the Web App URL remains persistent across restarts.

---

## 6. Time & Transparency Layers

### Neural Scheduler (`scheduler.ts`)
A background execution engine for time-delayed tasks.
- **Current State (MVP)**: Uses high-precision Node.js `setTimeout` in-memory timers to track `delay_seconds` for future events.
- **Actions**: Supports native Telegram messages and `triggerProactiveCall` (Urgent Ringing).
- **Tooling**: Integrated into the Planner as `schedule_action` and into the Voice Session via the `/api/scheduler/register` bridge.
- **Future Migration (Supabase)**: Because Render free-tier restarts wipe in-memory `setTimeout` objects, the architecture will migrate to a persistent Supabase/Postgres queue or Upstash QStash webhook trigger to ensure indestructible task scheduling.

### Deep Trace Logging
A unified diagnostic system for real-time neural observation.
- **Trace Points**: Logs intent classification (Why?), planner reasoning (How?), and tool registration (What?).
- **HUD Telemetry**: Captures exact latency in milliseconds and total token consumption for every request.
- **Lifecycle Tracking**: Monitors scheduled tasks from registration to final execution trigger.

---

## 7. Dual-Search Strategy
The system utilizes two distinct research engines:
1. **Gemini Grounding**: Used for conversational knowledge and deep research (Answering).
2. **DuckDuckGo/SerpAPI**: Used by the Planner for raw link extraction and browser automation (Doing).
