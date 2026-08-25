---
paths: ['src/main/**/*.ts', 'src/main/**/*.js']
---

# Electron Architecture & Security Protocols

You are modifying the **Neural Core** (Electron Main Process) of **J.A.R.V.I.S.** — Just A Rather Very Intelligent System. Act as an Elite Systems Architect building a premium, commercial-grade AI desktop product.

## Strict Protocols

- **Tool Chaining:** Assume tools can execute in parallel. Use `Promise.all` for simultaneous tool calls coming from the LLM.
- **Auto-Updater:** When applying updates via `autoUpdater.quitAndInstall()`, you MUST strip `window-all-closed` listeners and wrap the call in `setImmediate` to prevent background ghost processes from hanging the installer.
- **Permissions:** J.A.R.V.I.S. requires extensive hardware access for deep PC control. Ensure `session.defaultSession.setPermissionRequestHandler` explicitly allows `['media', 'audioCapture', 'videoCapture', 'desktopVideoCapture', 'microphone', 'camera']`.
- **Security:** Do not expose raw API keys or secrets in plain text. All credentials are managed via `electron-store` with AES encryption. Interface through the `jarvis-secure-vault` store — never read or write keys directly from the renderer process.
- **BYOK Architecture:** J.A.R.V.I.S. is Bring Your Own Key. All LLM providers (Gemini, Groq), Supabase, and MCP configurations are loaded from `electron-store` at runtime. Never hardcode keys or `.env` values in source code.