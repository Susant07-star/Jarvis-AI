import crypto from "crypto";
import type express from "express";
import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(process.cwd(), "logs", "debug.log");
const MAX_TAIL_BYTES = 768 * 1024;
const DEFAULT_LINE_COUNT = 700;
const MAX_LINE_COUNT = 2500;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 12;

type LineCount = number | "all";

type FailureState = {
  count: number;
  resetAt: number;
};

const failedAttempts = new Map<string, FailureState>();

function getLogCredential(): string | undefined {
  return process.env.JARVIS_LOG_TOKEN || process.env.JARVIS_LOG_PASSWORD || process.env.JARVIS_PIN;
}

function getProvidedCredential(req: express.Request): string {
  const headerToken = req.headers["x-jarvis-log-token"] || req.headers["x-jarvis-pin"];
  const queryToken = req.query.token || req.query.pin;

  if (typeof headerToken === "string" && headerToken.trim()) return headerToken.trim();
  if (Array.isArray(headerToken) && headerToken[0]) return headerToken[0].trim();
  if (typeof queryToken === "string" && queryToken.trim()) return queryToken.trim();

  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
      return decoded.split(":").slice(1).join(":").trim();
    } catch {
      return "";
    }
  }

  return "";
}

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getFailureKey(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isRateLimited(req: express.Request): boolean {
  const now = Date.now();
  const key = getFailureKey(req);
  const state = failedAttempts.get(key);

  if (!state || state.resetAt <= now) {
    failedAttempts.delete(key);
    return false;
  }

  return state.count >= MAX_FAILURES_PER_WINDOW;
}

function recordFailedAttempt(req: express.Request): void {
  const now = Date.now();
  const key = getFailureKey(req);
  const current = failedAttempts.get(key);

  if (!current || current.resetAt <= now) {
    failedAttempts.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
    return;
  }

  current.count += 1;
}

function clearFailedAttempts(req: express.Request): void {
  failedAttempts.delete(getFailureKey(req));
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isAuthorized(req: express.Request): boolean {
  const expected = getLogCredential();
  if (!expected) return !isProduction();

  const provided = getProvidedCredential(req);
  if (!provided) return false;

  return timingSafeEqualText(provided, expected);
}

export function isLogApiPath(apiPath: string): boolean {
  return apiPath === "/logs" || apiPath.startsWith("/logs/");
}

export function requireLogAccess(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const expected = getLogCredential();

  if (!expected && isProduction()) {
    res.status(503).json({
      error: "Log portal is disabled until JARVIS_LOG_TOKEN, JARVIS_LOG_PASSWORD, or JARVIS_PIN is configured.",
    });
    return;
  }

  if (isRateLimited(req)) {
    res.status(429).json({ error: "Too many failed logins. Wait a few minutes and try again." });
    return;
  }

  if (!isAuthorized(req)) {
    recordFailedAttempt(req);
    res.status(401).json({ error: "Unauthorized: invalid log portal credential." });
    return;
  }

  clearFailedAttempts(req);
  next();
}

function clampLineCount(value: unknown): LineCount {
  if (value === "all") return "all";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LINE_COUNT;
  return Math.max(50, Math.min(MAX_LINE_COUNT, Math.floor(parsed)));
}

function redactLogContent(text: string): string {
  return text
    .replace(/(authorization["']?\s*[:=]\s*["']?bearer\s+)[^"',\s]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|password)["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[REDACTED]");
}

export function readLogTail(lineCount: LineCount, redact = true): { text: string; size: number; updatedAt: string | null } {
  if (!fs.existsSync(LOG_FILE)) {
    return { text: "No debug.log found yet.\n", size: 0, updatedAt: null };
  }

  const stat = fs.statSync(LOG_FILE);
  let content: string;

  if (lineCount === "all") {
    content = fs.readFileSync(LOG_FILE, "utf8");
  } else {
    const start = Math.max(0, stat.size - MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(stat.size - start);
    const fd = fs.openSync(LOG_FILE, "r");

    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }

    const lines = buffer.toString("utf8").split(/\r?\n/);
    content = lines.slice(-lineCount).join("\n");
  }

  const text = content.endsWith("\n") ? content : `${content}\n`;

  return {
    text: redact ? redactLogContent(text) : text,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

export function sendLogTail(req: express.Request, res: express.Response): void {
  const lines = clampLineCount(req.query.lines);
  const redact = req.query.redact !== "0";
  const tail = readLogTail(lines, redact);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Jarvis-Log-Size", String(tail.size));
  if (tail.updatedAt) res.setHeader("X-Jarvis-Log-Updated-At", tail.updatedAt);
  res.send(tail.text);
}

export function renderLogPortalHtml(rawEndpoint = "/api/logs/raw"): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>JARVIS Live Logs</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #05070a;
      --panel: #0c1117;
      --panel-2: #121922;
      --border: #263241;
      --text: #e7eef7;
      --muted: #8ca0b4;
      --cyan: #49d9ff;
      --green: #39e58c;
      --yellow: #f7c948;
      --red: #ff5c7a;
      --purple: #b993ff;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .shell {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }

    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      background: #080c11;
    }

    h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
      font-weight: 700;
    }

    .subline {
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }

    button, input, select {
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      font-size: 13px;
    }

    button {
      min-width: 40px;
      padding: 0 12px;
      cursor: pointer;
    }

    button:hover, input:focus, select:focus {
      outline: none;
      border-color: var(--cyan);
    }

    input {
      width: 220px;
      padding: 0 11px;
    }

    select {
      padding: 0 9px;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--yellow);
      box-shadow: 0 0 12px currentColor;
    }

    .dot.live { background: var(--green); color: var(--green); }
    .dot.error { background: var(--red); color: var(--red); }

    main {
      display: grid;
      grid-template-columns: 270px 1fr;
      min-height: 0;
    }

    aside {
      border-right: 1px solid var(--border);
      background: #080c11;
      padding: 16px;
      overflow: auto;
    }

    .auth {
      display: grid;
      gap: 10px;
      margin-bottom: 20px;
    }

    .auth label, .filter-title {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .auth input {
      width: 100%;
    }

    .primary {
      background: #103241;
      border-color: #1f6d89;
      color: #dcf8ff;
      font-weight: 700;
    }

    .levels {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .level-option {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 8px;
      align-items: center;
      color: var(--text);
      font-size: 13px;
    }

    .level-option input {
      width: 16px;
      height: 16px;
      accent-color: var(--cyan);
    }

    .stats {
      display: grid;
      gap: 8px;
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
    }

    .log-wrap {
      min-width: 0;
      min-height: 0;
      padding: 14px;
      background: #05070a;
    }

    #logs {
      height: calc(100vh - 93px);
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #020408;
      font-family: "Cascadia Code", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 10px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .line {
      display: grid;
      grid-template-columns: 184px 70px 130px 1fr;
      gap: 8px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .line:hover { background: #0b131c; }
    .time { color: #7890a8; }
    .tag { color: var(--purple); }
    .INFO { color: var(--cyan); font-weight: 700; }
    .WARN { color: var(--yellow); font-weight: 700; }
    .ERROR { color: var(--red); font-weight: 700; }
    .DEBUG { color: #9aa4af; font-weight: 700; }
    .plain { color: #a7b2bd; display: block; padding: 2px 6px; }

    @media (max-width: 820px) {
      header { grid-template-columns: 1fr; }
      .toolbar { justify-content: flex-start; }
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--border); }
      #logs { height: 62vh; }
      .line {
        grid-template-columns: 1fr;
        gap: 0;
        padding: 6px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>J.A.R.V.I.S. Live Logs</h1>
        <div class="subline">Secure operator telemetry for Render debugging</div>
      </div>
      <div class="toolbar">
        <span class="status"><span id="dot" class="dot"></span><span id="status">locked</span></span>
        <input id="search" type="search" placeholder="Filter logs" autocomplete="off" />
        <select id="lines">
          <option value="300">300 lines</option>
          <option value="700" selected>700 lines</option>
          <option value="1500">1500 lines</option>
          <option value="2500">2500 lines</option>
          <option value="all">All logs</option>
        </select>
        <button id="pause" type="button">Pause</button>
        <button id="clear" type="button">Clear</button>
      </div>
    </header>
    <main>
      <aside>
        <form id="auth" class="auth">
          <label for="credential">Portal credential</label>
          <input id="credential" type="password" placeholder="PIN or log token" autocomplete="current-password" />
          <button class="primary" type="submit">Unlock Logs</button>
          <button id="logout" type="button">Lock</button>
        </form>

        <label class="level-option" style="margin-bottom: 16px;"><input id="redact" type="checkbox" checked /> Redact secrets</label>

        <div class="filter-title">Levels</div>
        <div class="levels">
          <label class="level-option"><input type="checkbox" value="ERROR" checked /> ERROR</label>
          <label class="level-option"><input type="checkbox" value="WARN" checked /> WARN</label>
          <label class="level-option"><input type="checkbox" value="INFO" checked /> INFO</label>
          <label class="level-option"><input type="checkbox" value="DEBUG" checked /> DEBUG</label>
        </div>

        <div class="stats">
          <div>Last sync: <span id="lastSync">never</span></div>
          <div>Log file: <span id="fileSize">unknown</span></div>
          <div>Visible lines: <span id="visibleCount">0</span></div>
        </div>
      </aside>
      <section class="log-wrap">
        <div id="logs" aria-live="polite"></div>
      </section>
    </main>
  </div>

  <script>
    const rawEndpoint = ${JSON.stringify(rawEndpoint)};
    const authForm = document.getElementById("auth");
    const credentialInput = document.getElementById("credential");
    const logoutButton = document.getElementById("logout");
    const searchInput = document.getElementById("search");
    const linesSelect = document.getElementById("lines");
    const redactInput = document.getElementById("redact");
    const pauseButton = document.getElementById("pause");
    const clearButton = document.getElementById("clear");
    const logsEl = document.getElementById("logs");
    const statusEl = document.getElementById("status");
    const dotEl = document.getElementById("dot");
    const lastSyncEl = document.getElementById("lastSync");
    const fileSizeEl = document.getElementById("fileSize");
    const visibleCountEl = document.getElementById("visibleCount");
    const levelInputs = Array.from(document.querySelectorAll(".level-option input"));

    let paused = false;
    let lastText = "";
    let timer = null;

    const params = new URLSearchParams(window.location.search);
    const queryCredential = params.get("token") || params.get("pin");
    if (queryCredential) {
      sessionStorage.setItem("jarvis_log_credential", queryCredential);
      history.replaceState(null, "", window.location.pathname);
    }

    const storedCredential = sessionStorage.getItem("jarvis_log_credential") || "";
    credentialInput.value = storedCredential;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function setStatus(text, mode) {
      statusEl.textContent = text;
      dotEl.className = "dot" + (mode ? " " + mode : "");
    }

    function formatBytes(bytes) {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value <= 0) return "empty";
      if (value < 1024) return value + " B";
      if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
      return (value / 1024 / 1024).toFixed(1) + " MB";
    }

    function getEnabledLevels() {
      return new Set(levelInputs.filter((input) => input.checked).map((input) => input.value));
    }

    function render(text) {
      const query = searchInput.value.trim().toLowerCase();
      const enabledLevels = getEnabledLevels();
      const lines = text.split("\\n");
      let visible = 0;

      const html = lines.map((line) => {
        if (!line.trim()) return "";
        if (query && !line.toLowerCase().includes(query)) return "";

        const match = line.match(/^\\[(.*?)\\] \\[(.*?)\\] \\[(.*?)\\] (.*)$/);
        if (!match) {
          visible += 1;
          return '<span class="plain">' + escapeHtml(line) + "</span>";
        }

        const time = match[1];
        const level = match[2];
        const tag = match[3];
        const message = match[4];
        if (!enabledLevels.has(level)) return "";

        visible += 1;
        return '<div class="line">' +
          '<span class="time">[' + escapeHtml(time) + ']</span>' +
          '<span class="' + escapeHtml(level) + '">[' + escapeHtml(level) + ']</span>' +
          '<span class="tag">[' + escapeHtml(tag) + ']</span>' +
          '<span>' + escapeHtml(message) + '</span>' +
        '</div>';
      }).join("");

      const shouldStick = logsEl.scrollHeight - logsEl.clientHeight <= logsEl.scrollTop + 60;
      logsEl.innerHTML = html || '<span class="plain">No matching log lines.</span>';
      visibleCountEl.textContent = String(visible);
      if (shouldStick) logsEl.scrollTop = logsEl.scrollHeight;
    }

    async function fetchLogs() {
      if (paused) return;

      const credential = sessionStorage.getItem("jarvis_log_credential") || credentialInput.value.trim();
      if (!credential) {
        setStatus("locked", "");
        return;
      }

      try {
        const response = await fetch(rawEndpoint + "?lines=" + encodeURIComponent(linesSelect.value) + "&redact=" + (redactInput.checked ? "1" : "0"), {
          cache: "no-store",
          headers: {
            "x-jarvis-pin": credential,
            "x-jarvis-log-token": credential
          }
        });

        if (!response.ok) {
          if (response.status === 401) sessionStorage.removeItem("jarvis_log_credential");
          const detail = await response.text();
          setStatus(response.status === 401 ? "locked" : "error " + response.status, "error");
          logsEl.innerHTML = '<span class="plain">' + escapeHtml(detail || "Unable to read logs.") + '</span>';
          return;
        }

        const text = await response.text();
        sessionStorage.setItem("jarvis_log_credential", credential);
        credentialInput.value = credential;
        fileSizeEl.textContent = formatBytes(response.headers.get("X-Jarvis-Log-Size"));
        lastSyncEl.textContent = new Date().toLocaleTimeString();
        setStatus("live", "live");

        if (text !== lastText) {
          lastText = text;
          render(text);
        }
      } catch (error) {
        setStatus("network error", "error");
      }
    }

    authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const credential = credentialInput.value.trim();
      if (credential) sessionStorage.setItem("jarvis_log_credential", credential);
      fetchLogs();
    });

    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem("jarvis_log_credential");
      credentialInput.value = "";
      lastText = "";
      logsEl.innerHTML = "";
      visibleCountEl.textContent = "0";
      setStatus("locked", "");
    });

    pauseButton.addEventListener("click", () => {
      paused = !paused;
      pauseButton.textContent = paused ? "Resume" : "Pause";
      setStatus(paused ? "paused" : "live", paused ? "" : "live");
      if (!paused) fetchLogs();
    });

    clearButton.addEventListener("click", () => {
      logsEl.innerHTML = "";
      visibleCountEl.textContent = "0";
    });

    searchInput.addEventListener("input", () => render(lastText));
    linesSelect.addEventListener("change", fetchLogs);
    redactInput.addEventListener("change", fetchLogs);
    levelInputs.forEach((input) => input.addEventListener("change", () => render(lastText)));

    fetchLogs();
    timer = window.setInterval(fetchLogs, 1800);
    window.addEventListener("beforeunload", () => {
      if (timer) window.clearInterval(timer);
    });
  </script>
</body>
</html>`;
}

export function registerLogPortalRoutes(app: express.Express): void {
  app.get(["/log", "/logs"], (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(renderLogPortalHtml("/api/logs/raw"));
  });
}
