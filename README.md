<div align="center">
  <img src="https://img.shields.io/badge/J.A.R.V.I.S.-AI-blue?style=for-the-badge&logo=openai" alt="J.A.R.V.I.S."/>
  <h1>🤖 J.A.R.V.I.S. Multi-Agent Web Assistant</h1>
  <p><i>A next-generation, voice-activated AI architecture scaling across Browser, Voice, and Vision tasks.</i></p>

  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Groq](https://img.shields.io/badge/Groq_LLM-purple?style=for-the-badge&logo=groq)](https://groq.com)
  [![Selenium](https://img.shields.io/badge/-Selenium-%2343B02A?style=for-the-badge&logo=selenium&logoColor=white)](https://www.selenium.dev/)
</div>

<hr />

## 🌟 Overview

J.A.R.V.I.S. (Just A Rather Very Intelligent System) is a powerful, locally-hosted multi-agent AI system. Unlike standard chatbots, J.A.R.V.I.S. isn't confined to a text box—it has **agency**. It can listen to your voice, control your browser via Selenium and Python, parse complex React/Vue DOM trees, and execute commands autonomously.

## 🚀 Key Features

*   **🗣️ Seamless Voice Interaction:** Sub-second Wake-Word and Speech-to-Text (Whisper) streaming via WebSockets.
*   **🌐 Autonomous Browser Control:** A background Python Agent (FastAPI + Selenium) that seamlessly executes DOM interactions, scrolling, multimedia control (YouTube/Spotify), and clicking.
*   **🧩 Modular Prompt Architecture:** Engineered for extreme token-efficiency. Prompts are built dynamically (mixing `voice`, `browser`, and `vision` JSON modules) based on the task at hand.
*   **🧠 Advanced Memory Summarization:** Retains long-term context without token-bloat. Automatic compression kicks in intelligently while preserving active DOM elements and arrays.
*   **🛡️ Production Safeguards:** Complete with 3-attempt WebDriver retry loops, background task hang-protection, and fully decoupled multi-agent memory siloing.

## 🏗️ Architecture Stack

This project is deeply decoupled into two high-performance servers:

1.  **Frontend & AI Brain (Node.js / React / TypeScript)**
    *   Handles the futuristic HUD user interface.
    *   Manages the WebSocket (STT/TTS stream) and Groq LLM logic.
    *   Maintains the `session_memory.json` engine.
2.  **Browser Execution Agent (Python / FastAPI)**
    *   A discreet background worker holding the Selenium WebDriver instance.
    *   Receives deterministic API JSON commands from the Node.js Brain.
    *   Finds smart locator paths utilizing custom `jarvis_id` DOM injection.

## ⚙️ Installation & Setup

**1. Clone the repository:**
```bash
git clone https://github.com/Susant07-star/Jarvis-AI.git
cd Jarvis-AI
```

**2. Setup Node.js Brain:**
```bash
npm install
# Create a .env.local file with your GROQ_API_KEY
npm run dev
```

**3. Setup Python Execution Agent:**
```bash
cd python_agent
pip install -r requirements.txt
python youtube_agent.py
```

## 📊 Token Usage & Logging
J.A.R.V.I.S. automatically tracks its own API cost efficiency. You can view historical charts of prompt sizes and completion tokens by analyzing the monthly logs auto-generated in `/logs/token_usage_[MONTH].csv`.

---
<div align="center">
  <i>"At your service." - J.A.R.V.I.S.</i>
</div>
