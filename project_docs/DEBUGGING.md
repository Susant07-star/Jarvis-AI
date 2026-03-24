# J.A.R.V.I.S. Debugging Guide

> For new developers and AI agents: **read this first** when something breaks.

---

## 🚨 Step 1: What Symptom Do You See?

| Symptom | First file to check | What to look for |
|---|---|---|
| JARVIS says "✅ executed" but nothing happened | `logs/debug.log` | `Python agent: 422` or `Python agent: 503` |
| JARVIS gives wrong / no response | `logs/debug.log` | `Failed to parse tool args` or `LLM routed to TASK` without a follow-up plan |
| Voice command not recognized | `logs/debug.log` | `STT` entries or missing `[IntentClassifier]` lines |
| Everything works but tokens not logged | `logs/token_detailed.json` | Missing or malformed JSON entries |
| Browser opens wrong site or does nothing | `logs/debug.log` | `Planner` output → verify `action` field; check `ACTION_MAP` in `youtube_agent.py` |
| High latency | `logs/token_detailed.json` | `latency_ms` field per request |

---

## 🗂️ File Priority — Check in This Order

### 1. `logs/debug.log` — *Always first*
- Contains the full request lifecycle: intent classification → orchestrator → planner → Python result
- **Key patterns to grep:**
  ```
  Python agent: 422    → Schema mismatch (action vs type field)
  Python agent: 503    → Python agent not running
  Failed to parse      → LLM output malformed JSON
  ERROR                → Any critical failure
  ```
- Entries are timestamped. Scroll to the **latest date** for current issues.

### 2. `logs/token_detailed.json` — *Token & latency issues*
- One JSON object per line. Latest entry = most recent request.
- If `total: 0` on an agent task, the Planner or Classifier tokens aren't being captured.

### 3. `logs/feedback_reports.csv` — *User-reported failures*
- Shows exactly what the user asked and what JARVIS replied.
- Negative feedback entries reveal UX failures that logs alone don't surface.

### 4. `project_docs/SYSTEM_STATUS.md` — *Known issues*
- If the issue is already listed under "Broken / Unstable Parts", it's a known bug — don't chase it.

### 5. `project_docs/CHANGELOG.md` — *Recent changes*
- If something just broke after a deployment, check what was last changed here.

---

## 🔍 Developer Checklist — Run Through This When Debugging

```
□ Is the Python agent running?
  → curl http://127.0.0.1:8000/health  (should return 200)

□ Is the Node server running?
  → curl http://localhost:3000/api/ping

□ Check debug.log for 422 errors from Python agent
  → Means Planner output schema doesn't match Python's expected format
  → Fix: check ACTION_MAP in python_agent/youtube_agent.py

□ Check debug.log for "Failed to parse tool args"
  → Means the LLM returned malformed JSON
  → Fix: check planner.ts prompt and response_format setting

□ Is the DOM extraction returning data?
  → curl -X POST http://127.0.0.1:8000/analyze  (should return elements array)
  → If elements: [] is empty, the browser tab may be blank or stuck

□ Check token_detailed.json — is the latest entry fresh?
  → Stale = Node server is not running or requests aren't reaching it

□ Is GROQ_API_KEY set in environment?
  → Node will respond with 500 "GROQ_API_KEY not configured" without it
```

---

## 📂 File Architecture at a Glance

```
server/
├── routes/api.ts          ← Chat endpoint, confirmation gateway
├── websocket.ts           ← Voice pipeline, confirmation gateway
├── browser/planner.ts     ← LLM → JSON action plan (key file)
├── intentClassifier.ts    ← Fast-path routing (chat vs task)
├── orchestrator.ts        ← Central decision router
├── utils/metrics.ts       ← Token + latency tracking
└── utils/docUpdater.ts    ← CHANGELOG + SYSTEM_STATUS auto-update

python_agent/
└── youtube_agent.py       ← All browser execution (safe_click, DOM, YouTube)

logs/
├── debug.log              ← Full request traces (rotate monthly)
├── token_detailed.json    ← One JSON line per request (rotate monthly)
├── feedback_reports.csv   ← User feedback (keep, never rotate)
└── token_usage_2026-03.csv← Legacy format (can archive)
```

---

## 🔄 Log Rotation Policy

> Logs grow indefinitely. Follow this policy to keep them manageable.

**`debug.log`** — Rotate monthly:
- Rename to `debug-YYYY-MM.log` at month end
- Keep last 3 months, archive or delete older ones
- Node auto-creates a new `debug.log` on restart

**`token_detailed.json`** — Rotate monthly:
- Each line is a JSON object. Move to `token_detailed-YYYY-MM.json`
- Good to keep 3 months for performance analysis

**`feedback_reports.csv`** — **Never rotate, never delete**
- This is user feedback data. Archive old months to `feedback_reports_YYYY.csv` but always keep it

**Script to rotate** — Run manually or as a scheduled task:
```powershell
# logs/rotate_logs.ps1
$month = Get-Date -Format "yyyy-MM"
if (Test-Path "logs\debug.log") { Move-Item "logs\debug.log" "logs\debug-$month.log" }
if (Test-Path "logs\token_detailed.json") { Move-Item "logs\token_detailed.json" "logs\token_detailed-$month.json" }
Write-Host "Logs rotated for $month"
```

---

## 🤖 Note for AI Agents (Antigravity and Future Agents)

When reading `debug.log`:
- **Always look at timestamps**. The file is append-only. Most recent entries are at the **bottom**.
- Focus on the last 50–100 lines for current issues.
- `grep` for `ERROR` or `422` first before reading the whole file.
- Old log entries from months ago are irrelevant — skip them.

When `debug.log` is rotated, the new empty file starts fresh. AI agents should:
1. Read `SYSTEM_STATUS.md` first for known issues
2. Check `CHANGELOG.md` for recent changes
3. Then read the tail of `debug.log` for live diagnostics
