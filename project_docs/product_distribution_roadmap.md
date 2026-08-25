# J.A.R.V.I.S. Productization & Distribution Roadmap

This document outlines the strategic phases to transform J.A.R.V.I.S. from a personal, hardcoded developer tool into a distributable, commercial desktop application (Tier 1: Desktop Edition).

## The Business & Architecture Strategy
- **Core Product:** A standalone Electron desktop application based on the existing IRIS codebase (React, Tailwind, Electron-Vite).
- **Business Model:** Bring Your Own Key (BYOK) + One-Time Software License Fee. 
- **Privacy & Security:** All API keys (LLM, Supabase, MCP) are stored securely and locally on the user's hard drive using `electron-store`. The backend AI processes run *within* the user's Electron app. Your server costs are $0.
- **Anti-Piracy:** Implemented via a central License Key verification server on first boot.

---

## Phase 1: Codebase Consolidation & Rebranding
**Goal:** Prepare the existing IRIS codebase to serve as the unified J.A.R.V.I.S. Desktop app.
*   Rename `IRIS-AI-main` UI elements to reflect the unified J.A.R.V.I.S. brand.
*   Clean up `package.json` and prune unused dependencies.
*   Ensure all scripts build correctly for a single distributable artifact (`npm run build`).

## Phase 2: The License & Anti-Piracy Gateway
**Goal:** Prevent unauthorized sharing of the `.exe` file.
*   Create a simple, free Vercel/Render server to validate generated license keys (e.g., via LemonSqueezy or Stripe API).
*   Build a **License Verification Screen** in the React app.
*   When a user opens the app for the first time, they must enter their purchased License Key.
*   Lock the license to the user's Hardware ID to prevent sharing.

## Phase 3: The "First-Run" API Onboarding Experience
**Goal:** Allow users to securely configure their own AI providers without touching code.
*   Build a sleek Setup Wizard UI.
*   **Screens:** 
    1. LLM API Key Setup (Gemini, Groq, etc.)
    2. Supabase Setup (URL & Anon Key for memory)
    3. Hardware Permissions (granting Jarvis access to mouse/keyboard/screen)
*   Implement `electron-store` (with encryption) to securely save and load these configurations on app startup.

## Phase 4: Dynamic Core Initialization
**Goal:** Detach JARVIS from hardcoded `.env` files.
*   Refactor the JARVIS backend/AI logic so it reads credentials directly from the user's `electron-store` configuration.
*   Ensure the AI agents and vector database initialize gracefully with the injected keys.
*   Implement a **Settings Dashboard** where users can rotate keys or tweak models at any time.

## Phase 5: UI Unification (Logs, Voice, Chat, MCP)
**Goal:** Bring all J.A.R.V.I.S capabilities into one beautiful interface.
*   Integrate the JARVIS chat interface, voice interface, and system logs directly into the Electron App's main window.
*   Create an **MCP Hub** screen where users can view active servers, install new ones, and configure MCP settings.

## Phase 6: Packaging and Distribution
**Goal:** Create a smooth, professional installation experience.
*   Configure `electron-builder` to generate production-ready Installers (`Jarvis-Setup.exe` for Windows, `.dmg` for Mac).
*   Add custom icons and installer branding.
*   Test the fresh install experience on a clean Virtual Machine to ensure no developer dependencies leak into production.

---
*Future Expansion (Tier 2): Once the desktop application is highly successful, a Cloud-Hosted Subscription tier can be developed to provide 24/7 access via Telegram when the host PC is turned off.*
