# I.R.I.S. Desktop Daemon

This is the I.R.I.S. (Intelligent Response and Interaction System) Desktop Daemon for the J.A.R.V.I.S. ecosystem.
It runs natively on the Windows host machine to provide physical computer control (keyboard, mouse, screen capture, app execution) and acts as the "hands" for J.A.R.V.I.S.

## Architecture
- **J.A.R.V.I.S.** runs the cognitive layers and LLM integration.
- **I.R.I.S.** runs the physical execution layer via Electron + Node native OS bindings.
- They communicate securely over a Cloudflare Tunnel using the `IRIS_API_KEY` bearer token.

## Capabilities
- `open_app` / `close_app`
- `type_text` (Clipboard Injection)
- `press_key` / `press_keys`
- `click_screen` / `scroll`
- `screenshot` (Electron Desktop Capturer)
- `run_command` (Shell execution)
- `adb_command` (Phone control)

## Setup
1. `npm install`
2. `npm run dev` (for development)
3. `npm run build` (for production compilation)

---
*Created for the J.A.R.V.I.S. project.*
