# J.A.R.V.I.S. Browser Agent — Developer Guide

> Last updated: 2026-05-19

---

## Architecture Overview

```
User Goal (natural language)
       │
       ▼
  ┌──────────┐     ┌────────────────┐
  │ planner  │────▶│ domExtractor   │  (optional: feeds live DOM into planner)
  └──────────┘     └────────────────┘
       │
       ▼
  BrowserAction[] (JSON plan)
       │
       ▼
  ┌──────────┐     ┌────────────────┐     ┌──────────────┐
  │ executor │────▶│ taskTracker    │────▶│ errorLogger  │
  └──────────┘     └────────────────┘     └──────────────┘
       │                    │
       ▼                    ▼
  ┌──────────┐     ┌────────────────┐
  │ actions  │     │ memoryManager  │
  └──────────┘     └────────────────┘
       │                    │
       ▼                    ▼
 Playwright /         data/memory/
 Python Selenium      data/tasks/
 (browser layers)
```

---

## File Reference

| File / Component | Purpose |
|------------------|---------|
| `browserManager.ts` | Launches persistent Node-based Chromium context (`./browser-data`) via Playwright. |
| `actions.ts` | Node-side Playwright browser actions (legacy, YouTube, universal). |
| `executor.ts` | Node-side orchestrator that runs plans with retry, memory, and task tracking. |
| `planner.ts` | LLM-based goal→action conversion (memory-aware). |
| `domExtractor.ts` | Node-side scraper of visible interactive elements. |
| `memoryManager.ts` | Dual-layer storage (operational + LLM summaries). |
| `taskTracker.ts` | Task lifecycle: create → track → retry → resume. |
| `errorLogger.ts` | Per-task error logs with sensitive data redaction. |
| `encryption.ts` | AES-256-CBC encrypt/decrypt for sensitive memory. |
| `dashboard.ts` | CLI tool for inspecting tasks, memory, and errors. |
| `supabaseAdapter.ts` | Storage adapter stub for future cloud migration. |
| `python_agent/youtube_agent.py` | Python-based FastAPI agent utilizing undetected-chromedriver (Selenium) for stealth/YouTube tasks. |

---

## Memory System

### Two Memory Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| **Operational** | `data/memory/operational/` | Full action logs, DOM snapshots, step results |
| **LLM** | `data/memory/llm/` | Token-efficient summaries (<500 chars) fed to planner |

### Encryption

Sensitive data (credentials, tokens, cookies) uses AES-256-CBC:

```ts
import { MemoryManager } from './memoryManager';

// Standard (unencrypted)
memory.saveMemory('task_log', { site: 'google.com', steps: [...] });

// Encrypted (for sensitive data)
memory.saveEncrypted('browser_session', { token: 'bearer-xyz', cookies: [...] });

// loadMemory() auto-decrypts if the entry was encrypted (backward compatible)
const data = memory.loadMemory('browser_session'); // works for both
```

**Encryption key**: Set `JARVIS_ENCRYPTION_KEY` (min 32 chars) in `.env.local`. Falls back to a deterministic dev key if unset — **do NOT use the fallback in production**.

### TTL Archival

```ts
memory.archiveOldMemory(); // Deletes entries older than 180 days (configurable)
```

Old entries are summarized into `data/memory/llm/` before deletion.

---

## Task Tracker

### Task Schema

```ts
{
  task_id: string;       // UUID
  site: string;          // e.g. "youtube", "wikipedia"
  goal: string;          // Natural language goal
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: [{
    action: string;
    status: 'pending' | 'completed' | 'failed' | 'skipped';
    retries: number;     // Max 2
    error?: string;
  }];
  last_step: string;
  timestamp: string;     // ISO creation time
  updated_at: string;
  memory_snapshot: any;  // State at last update
  errors: string[];      // Accumulated error messages
}
```

### Task Lifecycle

```
pending → in_progress → completed
                     ↘ failed (after 2 retries per step)
```

### Resume After Crash

The executor checks `isStepCompleted()` before each step. If JARVIS crashes mid-task:
1. Re-run the same `executePlan()` call
2. Completed steps are automatically skipped
3. Execution resumes from the first incomplete step

### Repeat Past Tasks

```ts
const lastTask = tracker.getLastTaskForGoal("like AI video");
// Returns the most recent matching task with its full step history
```

The planner automatically injects past task context to avoid repeating failures.

---

## Error Handling

### Retry Logic
- Each step retries **up to 2 times** with a 2-second cooldown
- After 2 failed retries, the step is marked `failed` and an alert fires
- The plan halts on persistent failure (no cascading crashes)

### Sensitive Data Redaction
Error logs automatically redact these patterns:
- `password`, `token`, `cookie`, `secret`, `apiKey`

Example log entry in `logs/tasks/<task_id>.log`:
```
[2026-03-23T12:00:00.000Z]
URL: https://youtube.com/watch?v=xyz
Action: youtube_like
Error: Timeout 30000ms exceeded
Memory: {"action":"youtube_like","apiKey":"[REDACTED]"}
---
```

---

## Dashboard CLI

```bash
# List all tasks
npx tsx server/browser/dashboard.ts tasks

# Filter by status
npx tsx server/browser/dashboard.ts tasks:active
npx tsx server/browser/dashboard.ts tasks:failed

# Inspect a specific task
npx tsx server/browser/dashboard.ts task <task_id>

# View error log for a task
npx tsx server/browser/dashboard.ts errors <task_id>

# Memory inspection
npx tsx server/browser/dashboard.ts memory:list
npx tsx server/browser/dashboard.ts memory:get <key>
npx tsx server/browser/dashboard.ts memory:summary <key>
npx tsx server/browser/dashboard.ts memory:size

# Archive old memory (TTL-based)
npx tsx server/browser/dashboard.ts memory:archive
```

---

## Adding a New Action

1. **Implement** the function in `actions.ts`:
   ```ts
   export async function myNewAction(page: Page, ...) {
       await humanPreAction(page);  // ALWAYS call this first
       // ... your logic
       await randomDelay();         // ALWAYS add human delay
   }
   ```

2. **Register** in `executor.ts` → `runAction()` switch statement

3. **Add** the action name to the `BrowserAction.action` union type

4. **Update** `planner.ts` prompt to teach the LLM about the new action

---

## Universal DOM Layer

For sites without hardcoded selectors, the system uses:

1. `domExtractor.ts` → scrapes visible interactive elements
2. `planWithDOM()` → feeds DOM map + goal to LLM
3. LLM returns `universal_click` or `universal_type` with dynamic selectors

### Selector Strategy Priority
| Strategy | Method | When to use |
|----------|--------|-------------|
| `role` | `getByRole()` | Buttons, links with ARIA roles |
| `text` | `getByText()` | Elements with visible text |
| `placeholder` | `getByPlaceholder()` | Input fields |
| `selector` | `locator()` | CSS fallback (last resort) |

---

## Supabase Migration Guide

When ready to move to cloud storage:

1. **Install** `@supabase/supabase-js`

2. **Create tables** using the schema in `supabaseAdapter.ts`:
   ```sql
   CREATE TABLE memory_store (
     key         TEXT PRIMARY KEY,
     value       JSONB NOT NULL,
     encrypted   BOOLEAN DEFAULT FALSE,
     created_at  TIMESTAMPTZ DEFAULT NOW(),
     updated_at  TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE tasks (
     task_id     UUID PRIMARY KEY,
     site        TEXT,
     goal        TEXT,
     status      TEXT CHECK (status IN ('pending','in_progress','completed','failed')),
     steps       JSONB,
     last_step   TEXT,
     errors      JSONB DEFAULT '[]',
     memory_snapshot JSONB,
     created_at  TIMESTAMPTZ DEFAULT NOW(),
     updated_at  TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Implement** the TODO methods in `supabaseAdapter.ts`

4. **Swap adapters** in `executor.ts`:
   ```ts
   // Before (local)
   const adapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'operational'));
   
   // After (cloud)
   const adapter = new SupabaseAdapter(SUPABASE_URL, SUPABASE_KEY, 'memory_store');
   ```

5. **No changes needed** in planner, actions, task tracker, or dashboard

---

## ⚠️ Watch-Out List for Future Developers

### 1. Browser Session Persistence
- Login sessions (Gmail, YouTube) are stored in `./browser-data/`
- If you delete this folder, all saved logins are lost
- **Never commit `browser-data/` to git** (already in `.gitignore`)

### 2. YouTube Selector Fragility
- YouTube frequently changes its DOM structure
- If `likeVideo()` or `commentOnVideo()` breaks, inspect the page and update selectors in `actions.ts`
- The `universal_click`/`universal_type` approach is more resilient for non-YouTube sites

### 3. Groq API Key Rotation
- Keys are comma-separated in `GROQ_API_KEY` env var
- `getGroqClient()` in `server/llm.ts` randomly picks one per call
- If you hit rate limits, add more keys

### 4. Memory File Corruption
- `LocalJsonAdapter` creates `.bak` files before every write
- If a JSON file corrupts, restore from the `.bak` copy
- Run `memory:archive` periodically to keep files small

### 5. Token Explosion
- The planner injects past task context into LLM prompts
- If memory grows large, the context window fills up fast
- `summarizeMemory()` compresses entries to <500 chars — call it regularly
- The `archiveOldMemory()` method purges entries older than TTL (default: 180 days)

### 6. Concurrent Execution
- The current system is **single-threaded** — one task at a time
- Running multiple `executePlan()` calls in parallel will cause race conditions on memory/task files
- If you need concurrency, implement file-level locking or move to Supabase

### 7. CAPTCHA & Bot Detection
- Some sites block Playwright via bot detection.
- The `humanPreAction()` wrapper in Playwright adds random delays and mouse movements to reduce detection.
- **Stealth Fallback**: For bot-sensitive sites (e.g., YouTube, Google Search), J.A.R.V.I.S. routes actions to the FastAPI Python agent (`youtube_agent.py`), which boots `undetected-chromedriver` (Selenium) to successfully bypass advanced anti-bot challenges.

### 8. Production Encryption Key
- **CRITICAL**: Set `JARVIS_ENCRYPTION_KEY` in production (min 32 chars)
- The fallback dev key is deterministic and NOT secure
- If the key changes, existing encrypted memory becomes unreadable — **back up data first**

### 9. Log Rotation
- Error logs accumulate in `logs/tasks/` indefinitely
- Implement periodic cleanup or rotate logs by date
- Token usage logs in `logs/` are already monthly (`token_usage_YYYY-MM.csv`)

### 10. Environment Variables Required

| Variable | Purpose | Required |
|----------|---------|----------|
| `GROQ_API_KEY` | LLM API access (comma-separated for rotation) | ✅ Yes |
| `JARVIS_ENCRYPTION_KEY` | AES-256 key for sensitive memory (min 32 chars) | ⚠️ Production only |
| `SUPABASE_URL` | Supabase project URL | 🔮 Future |
| `SUPABASE_KEY` | Supabase anon/service key | 🔮 Future |
