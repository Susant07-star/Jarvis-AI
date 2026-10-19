# J.A.R.V.I.S. Engineering Notes

This document contains implementation guidance for the current repository. It is not a claim that every recommendation is already implemented. For current behavior, use [Architecture](ARCHITECTURE.md) and [System Status](SYSTEM_STATUS.md).

## Model Context Protocol

The root server's `server/mcpManager.ts` uses the TypeScript MCP SDK with stdio transports. It reads server commands from runtime `data/mcp_config.json`, connects to configured processes, lists tools, namespaces them, and dispatches tool calls. The current manager documents and implements tool discovery/calls; do not imply that MCP resources, prompts, or remote SSE transport are supported without adding and verifying those paths.

Treat each configured MCP process as code with the permissions of the Node process. Validate configuration, avoid logging environment secrets, and do not connect untrusted servers.

## Tool and action design

When adding a capability:

1. Define the tool/action input and validate it at runtime.
2. Keep the model-facing description clear about prerequisites and limits.
3. Enforce permissions, ownership, and confirmation rules in backend code, not only in prompts.
4. Execute in a bounded function with timeouts and cancellation where possible.
5. Return a structured result containing success/failure and safe user-facing details.
6. Record useful telemetry while redacting credentials and private user data.

The repository has multiple executors. Confirm whether the feature belongs in the web Node service, Python browser service, I.R.I.S. local daemon, or Electron package before implementing it.

## Electron package guidance

`jarvis-desktop/` is a separate Electron application. For renderer-to-main communication, keep a narrow typed preload bridge, enable context isolation, disable renderer Node integration, validate IPC inputs in the main process, and expose only the operations the renderer needs. Verify actual Electron configuration in `jarvis-desktop/electron.vite.config.ts` and `src/preload/` rather than assuming the intended settings are active.

Do not promise that provider keys or user data remain local: requests to configured model or integration providers transmit the relevant inputs. Document storage and network data flows plainly.

## UI and accessibility

The repo uses React, Tailwind, Motion, and desktop-oriented visual components. Preserve keyboard access, clear progress/error states, readable contrast, and responsive behavior. Animation should communicate state and remain optional/reduced for users who request less motion. Avoid adding UI claims about capabilities that the backend cannot confirm.

## Prompt architecture

Root web prompts live under `server/agent_prompts/`; Electron has its own prompt directory. These files guide model behavior but do not register executable tools or enforce access control. Keep tool descriptions aligned with runtime registration and remove static “online” claims unless backed by a current health check.
