# J.A.R.V.I.S. Developer Knowledge Base & Guidelines

This document contains the latest architectural paradigms, design guidelines, and API protocols required to build a premium, highly-paid desktop AI assistant. Since some of these technologies (like MCP) are cutting-edge, this serves as the source of truth for the AI models and developers working on this codebase.

---

## 1. Model Context Protocol (MCP) Integration
Anthropic's Model Context Protocol (MCP) is an open standard that allows AI agents to securely connect to external tools and data sources. J.A.R.V.I.S. will act as an **MCP Host/Client**.

### Core MCP Concepts
*   **MCP Host (J.A.R.V.I.S.):** The application that talks to the LLM and routes requests to connected MCP servers.
*   **MCP Servers:** Lightweight local processes (or remote endpoints) that expose specific capabilities via standard JSON-RPC 2.0 over `stdio` or `SSE` (Server-Sent Events).
*   **Capabilities provided by servers:**
    *   **Tools:** Executable functions (e.g., `github_search`, `execute_bash`).
    *   **Resources:** Read-only data context (e.g., `file://logs`, `database_schema`).
    *   **Prompts:** Reusable workflow templates.

### Implementation Strategy for J.A.R.V.I.S.
1.  **The Client SDK:** We will use the official `@modelcontextprotocol/sdk` (TypeScript) in the Node.js/Electron main process.
2.  **Server Management:** J.A.R.V.I.S. must be able to spawn local MCP servers using `child_process.spawn` (e.g., running `npx -y @modelcontextprotocol/server-postgres`).
3.  **Dynamic Tool Injection:** When an MCP server connects, J.A.R.V.I.S. queries its `tools/list` endpoint and dynamically injects those tools into the LLM (Gemini/Groq) system prompt.

---

## 2. Electron-Vite Security & Architecture Guidelines
To ensure J.A.R.V.I.S. is a secure, premium application, we must follow modern Electron best practices.

### IPC (Inter-Process Communication) Security
*   **NEVER enable `nodeIntegration` in the renderer.**
*   **NEVER disable `contextIsolation`.**
*   All communication between the React UI (Renderer) and the Node.js backend (Main) MUST go through a strictly typed `preload.ts` script using `contextBridge.exposeInMainWorld`.
*   Example: The React frontend should never directly read the API keys from the disk. Instead, it calls `window.api.getApiKeys()`, and the Main process safely retrieves them from `electron-store`.

### Performance & Memory
*   **Dumb Renderer:** Keep the React frontend lightweight. It should purely handle UI rendering, animations (Framer Motion/GSAP), and state (Zustand).
*   **Heavy Lifting in Main:** All LLM network calls, Puppeteer scraping, and `nut.js` heavy OS automation must run in the Electron Main process (or hidden background worker windows).

---

## 3. UI/UX & Premium Design Guidelines
To justify a paid license, the app cannot look like a standard web wrapper. It must feel like a native, futuristic operating system layer.

### Aesthetics & Micro-Interactions
*   **Glassmorphism & Blur:** Use Tailwind's `backdrop-blur` heavily for modals and sidebars to blend with the user's desktop wallpaper.
*   **Typography:** Use a premium, highly readable font like `Inter` or `Geist`.
*   **Animations:** Use `framer-motion` for every state change. Nothing should "snap" instantly; elements should spring, fade, and slide gracefully.
*   **Voice Mode UI:** When voice mode is active, the UI should minimize into a sleek floating widget or display an audio-reactive waveform (using Web Audio API + Canvas).

---

## 4. Agent Skills Architecture (The "Hands")
J.A.R.V.I.S. is separated into the "Brain" (LLM) and the "Hands" (Skills).

### Skill Isolation Pattern
Instead of writing one massive file with 50 functions, each "Skill" must be its own module with a strict interface:
1.  **Name & Description:** Exactly what the tool does (passed directly to the LLM).
2.  **Zod Schema:** Strict validation for the parameters the LLM is passing.
3.  **Execute Function:** The actual Node.js code (`nut.js`, `fs`, `puppeteer`).

### Core Required Skills (V1)
*   `desktop_control`: Moving the mouse, clicking, typing (via `@nut-tree-fork/nut-js`).
*   `screen_capture`: Taking silent desktop screenshots to pass to Gemini Pro Vision.
*   `file_system`: Reading/writing files locally.
*   `terminal_exec`: Running safe shell commands.
*   `mcp_router`: Delegating unrecognized tasks to installed MCP servers.
