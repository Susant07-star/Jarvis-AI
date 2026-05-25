# J.A.R.V.I.S. + I.R.I.S. Engineering Audit & Roadmap

## 1. What's Actually Working RIGHT NOW (from logs)
| Action | Status | Evidence |
|---|---|---|
| `open_app` (vscode, notepad) | ✅ Working | `Opened vscode.` |
| `run_command` (PowerShell, shell) | ✅ Working | Listed installed apps, processes, created files |
| `close_app` | ✅ Implemented in I.R.I.S. | Not tested yet |
| `click_screen` | ✅ Implemented | Not tested yet |
| `scroll` | ✅ Implemented | Not tested yet |
| `press_keys` | ✅ Implemented (key array) | Not tested |
| `phantom_type` (clipboard inject) | ✅ Implemented | Not tested |
| `adb_command` (Android control) | ✅ Implemented | Not tested |

## 2. What's BROKEN and WHY

*(All issues below were successfully fixed in the 2026-05-24 update).*

### ✅ `screenshot` — Now Working
**Fix Applied:** Added `screenshot` case to `api-bridge.ts` using Electron's `desktopCapturer` API. J.A.R.V.I.S. can now see the screen.

---

### ✅ `press_key` — Now Working
**Fix Applied:** Added alias in `api-bridge.ts` so `press_key` parses the `key` string and splits it into the `keys` array expected by I.R.I.S.

---

### ✅ `type_text` — Now Working
**Fix Applied:** Added `type_text` as a direct alias for `phantom_type` (which uses clipboard injection to bypass key-rate limits) in `api-bridge.ts`.

---

### ❌ Screen Awareness (J.A.R.V.I.S. can't SEE what's on screen)
**Root Cause:** `screenshot` is broken. Even if it worked, J.A.R.V.I.S. has no loop where
it takes a screenshot → sends to vision model → acts on what it sees. This is a full
agentic planning loop that doesn't exist yet.

**Fix:** Add `screenshot` to I.R.I.S., then build a **Visual Agent Loop** on JARVIS server.

## 3. The Full IRIS Capability Map

```
I.R.I.S. CAN Do (if wired correctly):
├── 🖥️  App Control     → open_app, close_app
├── ⌨️  Keyboard        → press_keys, phantom_type (clipboard inject)
├── 🖱️  Mouse           → click_screen (bezier human-like movement), scroll
├── 📸  Screenshot      → NEEDS to be added to api-bridge.ts
├── 🔧  Shell Commands  → run_command (PowerShell, CMD, any shell)
├── 📋  Clipboard       → read/write (used by phantom_type)
├── 📱  ADB Android     → adb_command (control phone from PC)
└── 🪟  Window Manager  → telekinesis.ts (move/resize windows — but native bindings need compile)

I.R.I.S. CANNOT Do without extra work:
├── 🎙️  Listen to PC mic (separate pipeline needed)
├── 🧠  Understand screen content (OCR / vision model needed)
└── 🔄  Autonomous loop (see screen → decide → act → repeat)
```

## 4. The 3 Missing Action Fixes (30 min work)

These are simple name-alias fixes in `IRIS-AI-main/src/main/services/api-bridge.ts`:

```typescript
// FIX 1: type_text → calls phantom_type logic
case 'type_text': {
  // same as phantom_type but with friendlier name
  ...
}

// FIX 2: press_key → parses "ctrl+s" string into keys array
case 'press_key': {
  const keys = (payload.key || '').split('+').map(k => k.trim().toLowerCase())
  // call existing press_keys logic
  ...
}

// FIX 3: screenshot → uses Electron desktopCapturer
case 'screenshot': {
  // returns base64 PNG → J.A.R.V.I.S. feeds it to vision model
  ...
}
```

## 5. The Big Question: Offline First or Supabase First?

### My Engineering Recommendation: **OFFLINE FIRST** ✅

**Reason:** Supabase/Login is a *delivery* concern. Core intelligence is a *functionality* concern.
Shipping a broken product to a cloud database doesn't fix the broken product.

### The Correct Build Order:

```
PHASE 1 — Fix the Broken Actions (TODAY, ~1 hour)
├── Fix type_text, press_key, screenshot in api-bridge.ts
├── Rebuild IRIS Electron app (npm run build in IRIS-AI-main)
└── Test: "Type Hello World", "Press Ctrl+S", "Take a screenshot"

PHASE 2 — Screen Awareness Loop (2-3 hours)
├── Add screenshot action to IRIS (returns base64)
├── Add /api/iris/screenshot endpoint to JARVIS server
├── Add get_screenshot tool to zoyaLiveService.ts
└── J.A.R.V.I.S. can now SEE the screen and describe it to Boss

PHASE 3 — Agentic Visual Loop (3-4 hours)
├── Build a vision loop: screenshot → Gemini Vision → decide action → execute
├── Expose as "autonomous mode" tool
└── Now J.A.R.V.I.S. can: click the right button, fill forms, automate anything

PHASE 4 — Supabase + Login (2-3 hours)
├── Google OAuth (Supabase Auth)
├── PIN screen after login
├── Sync IRIS_WORMHOLE_URL to Supabase
└── Memory persistence across sessions

PHASE 5 — Polish & Deploy (ongoing)
```

## 6. Immediate Next Actions (in order)

1. **Fix the 3 broken actions** in `api-bridge.ts` (type_text, press_key, screenshot)
2. **Rebuild IRIS** — run `npm run build` inside IRIS-AI-main
3. **Restart IRIS** on PC so the new actions are live
4. **Test all actions** from Voice: "Open VS Code", "Take a screenshot", "Type hello"
5. **THEN** proceed to Supabase/Login when core works perfectly

> [!IMPORTANT]
> The Cloudflare free tunnel URL changes every time IRIS restarts.
> This is the #1 pain point right now. Fix: Supabase stores the URL so JARVIS
> always knows where IRIS is, even after restart. This is the ONE reason to
> do Supabase early — but only the URL-sync part, not full auth.

## 7. What You Need (No External APIs Required)
| Need | Status | Notes |
|---|---|---|
| Gemini API key | ✅ Have it | Used for Voice + Vision |
| IRIS local daemon | ✅ Running | Port 4000 |
| Cloudflare tunnel | ✅ Running | URL changes on restart |
| Supabase | ✅ Configured | Only needed for URL sync + auth |
| Python browser agent | ✅ Optional | Only for browser automation |
| SerpAPI | ✅ Have it | For web search |
| No extra APIs needed | ✅ | Everything runs offline |
