# J.A.R.V.I.S.: The Neural OS — AI Developer Context & Guidelines

## 📍 IDENTITY & PROJECT PURPOSE
You are an AI coding assistant tasked with building and maintaining **J.A.R.V.I.S.** (Just A Rather Very Intelligent System) — a high-performance, distributable, local-first Agentic Desktop Application. J.A.R.V.I.S. is not a standard web app; it is a deeply integrated, highly autonomous desktop environment built on Electron, featuring a real-time conversational audio pipeline, deep PC hardware control, multi-agent orchestration, and a fully configurable MCP (Model Context Protocol) hub.

**Distribution Model:** J.A.R.V.I.S. is a commercial desktop product. Users bring their own API keys (BYOK). All credentials (Gemini, Groq, Supabase, MCP) are stored locally via `electron-store` and never transmitted to any third-party server other than the respective API provider.

When writing code for J.A.R.V.I.S., adopt the mindset of a **High-End Silicon Valley Systems Architect**. Code must be hyper-optimized, visually cinematic, and uncompromisingly secure.

---

## 🛠️ TECH STACK & ARCHITECTURE
- **Core Framework:** Electron (Main Process) + React (Renderer Process) + Vite (via electron-vite).
- **Language:** TypeScript (Strict typing is mandatory).
- **Styling:** Tailwind CSS v4 (No raw CSS unless absolutely necessary).
- **Animations:** Framer Motion (for UI orchestration) & GSAP (for complex micro-interactions/loops).
- **3D Engine:** Three.js / React Three Fiber (R3F) (Must be heavily optimized, see performance rules).
- **AI Core:** Gemini 2.5 Flash/Pro (`BidiGenerateContent` WebRTC streaming for voice), Groq (for ultra-fast tool execution).
- **Memory:** Supabase with pgvector for semantic long-term memory (user-provided credentials).
- **Secure Storage:** `electron-store` for all API keys, user preferences, and configurations.
- **MCP Hub:** `@modelcontextprotocol/sdk` for dynamic tool injection via connected MCP servers.

---

## 🎨 UI / UX DESIGN SYSTEM (THE "J.A.R.V.I.S. NEURAL OS" AESTHETIC)
J.A.R.V.I.S. uses a premium, dark-mode, glassmorphic "Agentic AI" aesthetic. Do NOT use flat colors, standard white backgrounds, or generic web components.

### 1. Color Palette
- **Deep Backgrounds:** `#030303` or `#050505` (Never absolute black `#000000` unless for deep shadows).
- **Primary Accents:** Emerald / Neon Green (`emerald-400`, `emerald-500`, `#10b981`, `#34d399`) — The signature J.A.R.V.I.S. color.
- **Secondary Accents:** Cyan (`cyan-400`, `#06b6d4`), Purple (`purple-500`), Orange (`orange-500` for temp/warnings).
- **Error States:** Deep Red (`red-500`, `red-900/20`).

### 2. Components & Styling Rules
- **Glassmorphism:** Use heavily. Standard panels should be `bg-black/40 backdrop-blur-xl border border-white/5 shadow-2xl`.
- **Typography:** Use `font-sans` for main UI, and `font-mono tracking-widest uppercase text-[10px]` for system telemetry, labels, and logs.
- **Glows & Lasers:** Use absolute positioned `div` elements with `box-shadow` or `radial-gradient` to create ambient blooms behind active components.
- **No Scrollbars:** Hide standard scrollbars or style them to be ultra-thin (`scrollbar-small`) with `zinc-800` thumbs.
- **Naming:** All on-screen text MUST reference J.A.R.V.I.S. e.g. "J.A.R.V.I.S. ONLINE", "NEURAL UPLINK SECURE", "INITIALIZING JARVIS CORE".

---

## ⚙️ CORE ENGINEERING PROTOCOLS

### 1. The Electron Bridge (IPC Strictness)
- **NEVER** import `fs`, `path`, or `child_process` in the React (`@renderer`) layer.
- All system-level actions MUST be routed through `window.electron.ipcRenderer.invoke()` or `.send()`.
- Example: `await window.electron.ipcRenderer.invoke('secure-save-keys', data)`

### 2. BYOK Key Management
- All API keys are stored in `electron-store` under a `jarvis-secure-vault` key, encrypted at rest.
- The Main Process reads keys at startup and provides them to services. The Renderer NEVER accesses keys directly.
- On first launch (no keys found), the app must redirect to the Onboarding Setup Wizard before loading the main UI.

### 3. Audio & WebSocket Latency (The 250ms Rule)
- J.A.R.V.I.S. operates on a real-time WebRTC audio pipeline. Do NOT flood the WebSocket.
- Audio from `AudioWorklet` must be buffered (e.g., `4096` frames / ~250ms) before being base64-encoded and sent to Gemini.
- Always implement Voice Activity Detection (VAD) checks: if `serverContent.interrupted` is true, you must INSTANTLY flush local audio queues and stop playback nodes.

### 4. WebGL / 3D Performance (Strict Limitations)
If modifying `Sphere.tsx` or any R3F components:
- **Never** instantiate variables (like `new THREE.Color()` or `new THREE.Vector3()`) inside `useFrame`. Memory churn causes GC stutters. Pre-instantiate using `useMemo` and mutate via `.lerp()` or `.copy()`.
- Cap pixel ratios to prevent melting low-end GPUs: `<Canvas dpr={[1, 1.5]} gl={{ powerPreference: "high-performance" }}>`.
- For overlapping transparent particles, disable depth writing: `depthWrite={false}`.

---

## 📂 PROJECT STRUCTURE & ROUTING
- `/src/main`: Electron backend. Contains all tool logic, hardware handlers, and IPC registry.
- `/src/renderer/src`: React frontend. Contains all visual layers.
  - `/components`: Reusable UI parts.
  - `/views`: Main OS screens (Dashboard, Settings, Onboarding, LockScreen).
  - `/hooks`: Custom React logic.
  - `/services`: Class-based managers (e.g., `GeminiLiveService`, `VoiceEngine`).
- `/src/preload`: The secure bridge exposing APIs to `window.electron`.

---

## 🤖 J.A.R.V.I.S. TOOL CAPABILITIES (CONTEXT FOR ASSISTANT)
J.A.R.V.I.S. natively executes the following "Hands" (Skills). When writing frontend logic, assume the backend can handle:
- **Desktop Control:** Move mouse, click, scroll, type (via `@nut-tree-fork/nut-js`).
- **Screen Vision:** Silent screenshots fed to Gemini Pro Vision for computer-use loops.
- **File System:** Read, write, move, index, and semantic search local files.
- **Terminal Execution:** Safe shell command runner with output streaming.
- **Mobile ADB:** Launch Android apps, tap/swipe screen, pull/push files, toggle hardware.
- **MCP Router:** Delegate unrecognized tasks to dynamically connected MCP servers.
- **Deep Research:** Autonomous Puppeteer-powered web crawler for multi-step research.
- **Generative:** Create floating desktop widgets, build local animated websites, generate images.

---

## 🚨 CODE GENERATION RULES (READ CAREFULLY)
1. **Never use generic placeholder text.** Use highly technical, J.A.R.V.I.S.-themed text (e.g., "INITIALIZING NEURAL CORE", "JARVIS UPLINK SECURE", "DEPLOYING AGENT PROTOCOL").
2. **Always handle loading/error states.** A premium OS never shows a blank screen or a raw JavaScript error. Catch all promises and display cinematic error HUDs.
3. **If you update main process logic**, remember to update the `preload` script if new variables need to be exposed.
4. **Assume the user is a Power User / Creator.** Execute commands swiftly. Do not write overly cautious dialogues unless requested.