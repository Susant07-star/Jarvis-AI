# J.A.R.V.I.S. Future Architecture: The "Iron Man" Blueprint

This document outlines the strategic roadmap for evolving J.A.R.V.I.S. from a modular assistant into a high-fidelity, multi-layered agentic system inspired by Zoya's communication and the "Iron Man" suit's intelligence.

## 🌟 The Vision
To create a seamless, real-time AI experience where **Zoya (Gemini 1.5 Flash or higher)** acts as the "Front-end Commander" (Ears, Mouth, Eyes) and a **Massive LLM (GPT-OSS 120B+ or Llama 3 70B)** acts as the "High-IQ Brain" (Planning, Coding, Self-Healing).

---

## 🏗️ The Multi-Layered Architecture

### Layer 1: The Commander (Front-end)
- **Model:** `gemini-1.5-flash`
- **Role:** Handles all User Interaction.
- **Capabilities:** 
    - **Streaming Audio:** Real-time, low-latency Hinglish conversation via WebSockets.
    - **Visual Input:** "Eyes" that can see the screen or camera to assist the Brain.
    - **Status Updates:** Keeps the user engaged with real-time commentary (e.g., *"Sir, the Core is currently analyzing the firewall..."*).

### Layer 2: The High-IQ Brain (Reasoning)
- **Primary Model:** `GPT-OSS` (120B+ Parameters) or `DeepSeek-V3`
- **Fallback Model:** `Llama-3-70B` (via Groq)
- **Role:** Complex Planning & Logic.
- **Capabilities:**
    - **Multi-step Planning:** Breaks complex user requests into discrete Python/Selenium actions.
    - **Code Generation:** Writes new automation scripts on the fly.
    - **Self-Healing:** Analyzes error logs and rewrites its own code to fix bugs.

### Layer 3: The Hands (Execution)
- **Technology:** `Python`, `FastAPI`, `Selenium (Undetected Chromedriver)`
- **Role:** Physical interaction with the OS and Web.
- **Capabilities:** Clicking, scrolling, typing, and data extraction.

---

## 🛠️ The Self-Healing System (Maintenance Mode)
A background process that ensures J.A.R.V.I.S. never stays "broken."

1. **Error Capture:** All Python and Node.js errors are piped into `logs/error.log`.
2. **Analysis:** The **Engineer Agent (GPT-OSS)** monitors the logs.
3. **Healing Loop:**
   - Detects a failure (e.g., "YouTube selector changed").
   - Reads the relevant `.py` or `.ts` file.
   - Generates a **Proposed Fix**.
   - Runs a test to verify the fix.
   - **Approval:** Prompts the user: *"Sir, I've found a fix for the YouTube issue. Shall I apply it?"*

---

## 📋 Technical Requirements
- [ ] **Google AI Studio API Key:** For Gemini 1.5 Flash (Voice/Eyes).
- [ ] **Groq / DeepSeek API Key:** For the High-IQ Reasoning layer.
- [ ] **Unified WebSocket:** Merging Zoya's live stream with Jarvis's command pipeline.
- [ ] **Log Watcher:** A Python `watchdog` script to trigger the Self-Healing loop.

---

## 🚀 Phase 2 Implementation Steps (✅ COMPLETED)
1. **Bridge the APIs:** Integrated Zoya's `LiveSessionManager` into the Jarvis frontend as `zoyaLiveService.ts`.
2. **Define Tools:** Ported current Jarvis commands into Gemini "Function Calls" (`executeJarvisCommand`).
3. **Implement "Commander" Mode:** Coded logic for Zoya to give verbal updates and UI feedback while background tasks are running.
4. **Setup Error Analysis:** Multi-provider LLM cascade now handles basic error reasoning before reporting back to Zoya.


## 8. Future Roadmap
- **Thought Process Dropdown (UI Transparency)**: A planned feature to add an expandable `<details>` accordion to chat bubbles when J.A.R.V.I.S./Zoya executes tasks. This will allow the user to click a dropdown arrow and view the AI's internal reasoning, intermediate search queries (Native Search), and DOM actions in real-time, matching the transparency of advanced AI tools.

- **Autonomous Hybrid Browser Agent (Gemini 3 Flash)**: An upgrade to J.A.R.V.I.S.'s execution engine. It will use a multi-modal "Look -> Decide -> Act" loop. By feeding Gemini 3 Flash both a **Simplified DOM** (for precision) and a **Spatial Screenshot** (for layout awareness), J.A.R.V.I.S. will gain the ability to navigate complex web apps, handle dynamic popups, and reason through visual interfaces autonomously, exactly like a human researcher.

---
*"At your service, sir. Let's build something extraordinary."*

