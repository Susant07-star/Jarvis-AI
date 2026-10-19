# J.A.R.V.I.S. Roadmap

> This is a proposed engineering sequence based on the repository state reviewed on 2026-10-19. It is not a release schedule. “Present in code” does not mean production-ready or verified in a deployed environment; see [System Status](SYSTEM_STATUS.md).

## 1. Close security and execution-boundary gaps

- [ ] Remove example secrets and insecure fallback keys from runtime defaults; fail closed when required secrets are missing.
- [ ] Add authentication and request validation to the Python browser service, and bind it to a private interface by default.
- [ ] Define one policy for tool permissions, user confirmation, and destructive/external actions across chat, voice, Telegram, and desktop routes.
- [ ] Review the log portal, voice enrollment, MCP configuration, and I.R.I.S. bridge as one security boundary.
- [ ] Document and verify the data each provider and service receives.

**Completion evidence:** security review of each exposed route, negative tests for unauthorized requests, and documented safe deployment defaults.

## 2. Make action routing and outcomes reliable

- [ ] Write down the active request path for each interface and capability; identify unused or legacy paths in `server/browser/` and `python_agent/`.
- [ ] Use typed tool/action schemas and validate model-produced payloads before execution.
- [ ] Give every action a consistent lifecycle: proposed, awaiting confirmation when required, running, succeeded/failed, and user-visible result.
- [ ] Persist execution IDs and results so a model cannot report success when a downstream tool failed or timed out.
- [ ] Add timeouts, cancellation, bounded retries, and idempotency rules to external actions.

**Completion evidence:** route-level integration tests cover normal completion, refusal/confirmation, unavailable services, malformed payloads, timeout, and retry behavior.

## 3. Consolidate state and scheduling

- [ ] Define which records belong in Supabase and which can remain local files; specify retention and recovery behavior.
- [ ] Ensure thread history falls back consistently when the database is empty or unavailable.
- [ ] Make one-time and recurring schedules durable across restarts and multiple service instances, preferably with an external queue/worker contract.
- [ ] Store and apply timezone per user/job instead of relying on a hard-coded timezone in recurring execution.
- [ ] Add clear migrations and setup instructions for memory, knowledge, tasks, and recurring-job tables and RPC functions.

**Completion evidence:** restart and outage tests prove the documented recovery and delivery guarantees.

## 4. Add repeatable evaluation and observability

- [ ] Add automated tests for intent classification, confirmation state, tool parsing/validation, model cascade selection, scheduling, and memory fallback.
- [ ] Add safe integration tests for mock providers and mock browser/desktop executors; keep real devices and credentials out of CI.
- [ ] Emit a correlation ID through API/SSE/WebSocket, LLM, tool, scheduler, Telegram, and integration logs.
- [ ] Measure success/failure and latency by route and tool, not only token usage.
- [ ] Redact secrets, sensitive prompt fields, and personal data from logs by default.

**Completion evidence:** CI covers the core control flow, and a user can trace one request from ingress through tool result without exposing credentials.

## 5. Clarify product boundaries

- [ ] Decide whether `jarvis-desktop/` is an independent application or a client for the root Node service; document and implement that contract.
- [ ] Avoid describing independent modules as a single connected system unless an integration path and deployment proof exist.
- [ ] Choose the supported deployment target for the root web service, Python browser service, voice service, and I.R.I.S. daemon.
- [ ] Align environment-variable names, onboarding, versioning, and release steps across packages.

**Completion evidence:** a clean-machine setup guide can install each supported mode and clearly state which actions require a powered-on local machine.

## 6. Evaluate workflow frameworks only when needed

The current orchestration is hand-written TypeScript with separate paths and a bounded tool loop. There is no LangGraph dependency in the root package. A graph runtime could help if workflows need durable checkpoints, resumable long-running tasks, or explicit branching/state inspection; evaluate it against those requirements before migrating existing routes.

**Completion evidence:** a small proof of concept demonstrates a concrete capability that the current implementation cannot provide cleanly, with a migration cost and failure-mode comparison.
