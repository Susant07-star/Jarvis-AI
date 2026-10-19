# J.A.R.V.I.S. Python Browser Service

This folder contains an optional FastAPI service that drives a local Selenium/Chrome browser. The root Node service can call it for browser marking and execution when `USE_BROWSER_AGENT=true`. It is separate from the root server and from the Playwright modules under `server/browser/`.

## Run locally

From the repository root on a trusted development machine:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python_agent/requirements.txt
python python_agent/youtube_agent.py
```

The script runs Uvicorn on `0.0.0.0:8000`. Chrome and compatible Selenium support are also required. The root Node service expects this process at `http://127.0.0.1:8000`.

## Endpoints used or exposed

| Endpoint | Purpose |
|---|---|
| `POST /execute` | Execute browser commands |
| `POST /mark-page` | Mark visible interactive elements and return a screenshot/map for visual planning |
| `GET /browser-status` | Return browser service status |
| `POST /analyze` | Analyze the active page |
| `POST /click-coordinate` | Click a coordinate in the active page |
| `POST /evaluate` | Run caller-supplied JavaScript in the active page |

The service API is an internal integration contract and may change with the Node routes. Check `youtube_agent.py` before adding callers.

## Security boundary

The current service does not authenticate these endpoints, and `/evaluate` accepts arbitrary JavaScript for the active browser page. It binds to all network interfaces by default. Do not run it on an untrusted network or expose port `8000` to the internet. Use a host firewall and private network while it lacks authentication and scoped permissions.

## Scope and verification

This is an experimental, local browser automation service, not a general-purpose secure remote browser. A reachable endpoint only confirms the service is responding; it does not prove that Chrome is logged into the expected account or that a requested action succeeded. Inspect the returned per-command result and verify consequential changes in the browser.

See the root [Architecture](../project_docs/ARCHITECTURE.md) and [Developer Guide](../project_docs/DEVELOPER_GUIDE.md) for how the Node app routes work to this service.
