# J.A.R.V.I.S. Product and Distribution Notes

> Planning document only. The repo currently contains a root web application, optional sidecar services, and a separate Electron package. It does not currently provide one verified installer that bundles and configures the whole ecosystem.

## Product shape to decide

J.A.R.V.I.S. has a service-oriented architecture even though it is a personal project. A supported product mode needs to specify which machine runs each component, which data leaves that machine, which actions are allowed, and what remains available when a local machine is offline.

Two practical deployment modes are possible:

1. **Local-first desktop:** Electron app and local action/browser services run on the user's computer; provider requests and optional Supabase/Telegram services still use external networks.
2. **Web service plus paired local agent:** Node web service hosts the remote UI/chat/scheduling, while a separately authenticated local agent handles browser and OS actions on the user's machine.

The current repository has pieces of both modes, but the connection and release contract between them is not yet a single documented install flow. Do not present either mode as turnkey until clean-machine setup and end-to-end behavior are verified.

## Recommended order

### 1. Define trust and deployment boundaries

- Decide which services can bind to public interfaces and which must remain loopback/private.
- Replace sample secrets and insecure defaults; require authentication for Python browser and local action endpoints.
- Define permissions and user confirmation for shell, filesystem, browser, account, and messaging actions.
- State clearly when audio, prompts, embeddings, browser state, and logs are sent to external providers.

### 2. Make local service pairing explicit

- Specify a pairing flow for the web service and local browser/desktop agent.
- Use revocable, scoped credentials instead of a permanent shared token.
- Add health checks, offline behavior, cancellation, and an action audit trail.
- Keep local actions unavailable until the user pairs the device and grants the required permission.

### 3. Choose the supported application boundary

- Either keep Electron as an independent desktop app with separately documented features, or define a maintained contract for it to use the root Node service.
- Avoid copying server modules between packages without a shared package boundary and versioning plan.
- Add a clean install/uninstall flow only after required runtime dependencies and data locations are clear.

### 4. Prepare release and support

- Add package-specific CI for type checking, linting, and focused automated tests.
- Build and smoke-test artifacts on clean Windows, macOS, and Linux machines before listing a platform as supported.
- Document environment setup, data backup/deletion, upgrade behavior, provider outages, and support diagnostics.
- Keep cloud deployment claims separate from local OS/browser capabilities; a cloud process cannot control a user's computer unless a paired local agent is online.

## Release gate

Do not label the system production-ready or publish an all-in-one installer until the security review, pairing model, data-flow documentation, clean installation, update path, failure recovery, and relevant integration tests have concrete evidence. See the [engineering roadmap](ROADMAP.md) for implementation priorities.
