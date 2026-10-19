# J.A.R.V.I.S. Debugging Guide

Start by identifying the surface and route. Web chat, Live voice, Telegram, Python browser automation, I.R.I.S., voice matching, and the Electron app have separate processes and failure modes. See [Architecture](ARCHITECTURE.md) for the request paths.

## 1. Identify the failing layer

| Symptom | First checks |
|---|---|
| Web app does not start | `npm ci`, `.env.local`, port `3000`, and `server.ts` output |
| Chat returns a configuration error | Set both `GEMINI_API_KEY` and `GROQ_API_KEY`; `/api/chat` currently checks Groq before dispatching the chat provider cascade |
| Voice cannot connect | Browser microphone permission, `GEMINI_API_KEY`, model access, browser console, and the Live model cascade in `src/services/zoyaLiveService.ts` |
| Chat works but a browser task does not | Intent result, planner output, confirmation state, `USE_BROWSER_AGENT=true`, then Python service health on port `8000` |
| Local desktop action fails | `IRIS_WORMHOLE_URL`, matching `IRIS_API_KEY`, I.R.I.S. process/tunnel, and `/api/iris/status` |
| Reminder/job did not fire | Node process uptime, Supabase `tasks`/`research_jobs` records, timezone, and Telegram delivery configuration |
| Knowledge recall is empty | Supabase credentials, embeddings, table/RPC schema, and `match_knowledge` or `match_memories` errors |
| MCP tool is missing | Runtime `data/mcp_config.json`, child process command/args/env, and MCP connection logs |
| Voice identity result is wrong | Voice service health, secret match, audio sample quality, enrolled embedding, and threshold behavior; do not use it as an auth control |

## 2. Trace one request

1. Note the interface, approximate timestamp, and exact route/action. Do not include credentials or private content in a bug report.
2. Check the Node console and `logs/debug.log` for the matching request, provider, planner, tool, or scheduler entries.
3. Check `logs/token_detailed.json` when the issue concerns model selection, tokens, or latency.
4. If `USE_BROWSER_AGENT=true`, check the Python process output and `/browser-status`; the Python service runs separately from Node.
5. For remote integrations, check the service's own health/logs and credentials. A Node “request sent” entry is not proof that an external action completed.
6. Compare the tool result with the final response. Treat a success message without a successful executor result as a bug.

Logs may contain prompts, URLs, task content, and provider errors. Review and redact them before sharing. Do not paste API keys, voice embeddings, session data, or private account information into issues.

## 3. Common checks

### Environment and server

- The root process loads `.env` and then `.env.local`. Verify actual loaded values without printing secrets.
- Confirm port `3000` is available and that the process started the integrations you expect.
- Replace all demo values from `.env.example`. The example file is not safe to deploy unchanged.
- `JARVIS_PIN` is required at startup. If the server refuses to start, configure a private value in `.env` or `.env.local`.
- Protected routes, including `/api/config/auth` and `/api/config/keys`, require the PIN. The browser config endpoint uses `SUPABASE_ANON_KEY`; `SUPABASE_KEY` stays server-side. Gemini Live receives `GEMINI_API_KEY` in the authenticated browser because its audio session connects directly to Google.

### Browser agent

- The Node app calls the Python service at `http://127.0.0.1:8000`.
- Start it from the repository root with `python python_agent/youtube_agent.py` after installing `python_agent/requirements.txt` and confirming Chrome/Selenium support.
- Ensure `USE_BROWSER_AGENT=true` for paths that require the service. Otherwise browser execution is disabled or falls back to a non-browser response.
- The service currently has no action-endpoint authentication. Do not expose it beyond a trusted local boundary while debugging.

### Database and scheduled work

- Check Supabase schema, table names, RPC signatures, and permissions against the caller code.
- One-time and recurring schedules execute through the Node process. If it is stopped, delivery depends on restore behavior and the next startup; this is not an external queue.
- Confirm the configured timezone and downstream notification service separately.

### Model routing

- Live voice, text chat, planner, and research use different cascade definitions. Inspect the relevant route rather than assuming one “primary model” applies everywhere.
- Chat responses can include provider/model metadata. Router warnings report failed attempts; redact provider error bodies before sharing.
- A model being first in an array proves configuration order, not provider availability or successful inference.

## 4. Checks available in the repository

From the root package:

```powershell
npm run lint   # TypeScript check
npm run build  # Web frontend production build
```

There is no root general-purpose test script. The desktop package has separate scripts. Choose checks that match the code changed; these commands do not validate live credentials, browser actions, Telegram delivery, voice matching, or remote desktop control.

## 5. Log maintenance

The repository includes `logs/rotate_logs.ps1` for local log rotation. Review its behavior and make a backup before using it on valuable user data. Runtime logs and data are ignored by Git; do not commit them as debugging evidence without redaction.

For the current known limitations and configuration requirements, see [System Status](SYSTEM_STATUS.md). For recent changes, see [Changelog](CHANGELOG.md).
