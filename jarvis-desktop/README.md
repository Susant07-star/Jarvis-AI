# J.A.R.V.I.S. Desktop

**J.A.R.V.I.S.** (Just A Rather Very Intelligent System) is a premium, distributable AI desktop application. It is a Voice-First, PC-native AI operating layer that gives you complete, hands-free authority over your digital environment — powered entirely by your own API keys.

## Architecture
- **J.A.R.V.I.S. Brain:** All LLM reasoning, multi-agent orchestration, voice processing, and memory live inside the Electron Main process, running locally on the user's machine.
- **J.A.R.V.I.S. Hands:** Deep PC control capabilities (keyboard, mouse, screen capture, app execution, shell commands) via native OS bindings.
- **BYOK (Bring Your Own Key):** Users configure their own Gemini, Groq, and Supabase credentials via a secure First-Run onboarding wizard. Keys are stored locally using `electron-store` and never transmitted to any third-party server.

## Capabilities
- `Voice Mode` — Real-time conversational AI using Gemini Live API
- `Chat Mode` — Persistent, memory-backed chat sessions
- `Desktop Control` — Mouse, keyboard, screen reading (`@nut-tree-fork/nut-js`)
- `Terminal Execution` — Safe shell command runner
- `MCP Hub` — Connect and manage Model Context Protocol servers
- `File System` — Deep local file reading, indexing, and management
- `Logs Viewer` — Real-time agent activity and thought-process logs

## Setup (Development)
1. `cd jarvis-desktop`
2. `npm install`
3. `npm run dev` (launches the app in dev mode)

## Build (Distribution)
- `npm run build:win` — Generates `Jarvis-Desktop-Setup.exe` for Windows
- `npm run build:mac` — Generates `.dmg` for macOS
- `npm run build:linux` — Generates `.AppImage` / `.deb` for Linux

---
*Part of the J.A.R.V.I.S. ecosystem.*
