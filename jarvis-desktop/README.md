# J.A.R.V.I.S. Desktop

`jarvis-desktop/` is a separate Electron application in the J.A.R.V.I.S. repository. It has its own renderer, main/preload processes, server modules, dependencies, environment/configuration, and build scripts. It is not launched by the root web app and is not currently a bundled wrapper around the root server.

## What is in this package

The codebase includes a React/Electron interface with voice and chat experiences, a main-process IPC boundary, local browser/desktop-oriented tools, MCP and workflow views, scheduling and log views, and integrations for system information, files, research, and other widgets. These are implementation areas in an actively developed application; the presence of a screen or tool module does not by itself establish that every integration is complete, safe, or release-ready.

The desktop package also contains its own `src/server/` modules. They overlap with root `server/` in concepts such as routing, tools, scheduling, memory, Telegram, and MCP, but they are not automatically kept in sync. Check which package is being changed and follow its actual call path.

## Development

```powershell
cd jarvis-desktop
npm install
npm run dev
```

Useful scripts from `package.json`:

```powershell
npm run typecheck
npm run lint
npm run build
```

Packaging scripts are also defined: `build:win`, `build:mac`, and `build:linux`. Build and test the artifact on a clean target machine before claiming a platform is supported.

## Security and local actions

This app contains native desktop capabilities and handles provider credentials. Review the current main/preload bridge, IPC handlers, permission checks, shell execution, filesystem access, and provider requests before using it with sensitive data. Do not assume credentials remain local merely because they are stored by the app: model and integration requests necessarily send relevant inputs to their configured services.

## Related documentation

- [Desktop agent rules](docs/Agents.md)
- [System textbook](docs/JARVIS_system_textbook.md)
- [Repository architecture](../project_docs/ARCHITECTURE.md)
- [Runtime comparison](../project_docs/feature_comparison.md)
