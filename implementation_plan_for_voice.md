# Advanced Voice Recognition & Speaker Verification System

This document outlines the technical implementation plan to add advanced voice biometrics to J.A.R.V.I.S., satisfying the requirements of Real-Time Speaker Identification, Dynamic Enrollment, Target Speaker Extraction, and Hardcoded Security.

## User Review Required

> [!CAUTION]
> **Render Free Tier Limitation Detected:** Since Jarvis is hosted on the Render Free Plan (which only has 512MB RAM), we **cannot** run heavy AI models like SpeechBrain there. The server will crash instantly. 
> 
> **Revised Audio Engine Options:**
> - **Option 1 (The Lightweight Route):** We use **Picovoice Eagle**. It is extremely lightweight and will run perfectly on the Render Free tier without crashing. The tradeoff: It does *not* have "Target Speaker Extraction" (it can't magically filter out the stranger's voice if you speak at the exact same time, but it will still recognize who is who if you speak normally).
> - **Option 2 (The Heavyweight Route via I.R.I.S.):** If you *really* want Target Speaker Extraction, we run the heavy Python Microservice locally on your desktop computer inside the **I.R.I.S.** app. The Render server will simply pass the audio over the Cloudflare tunnel to your PC, your PC does the heavy lifting, and sends the result back.
> 
> **Recommendation:** Let's go with **Option 1 (Picovoice Eagle)** on the Node.js backend to start. It's much simpler, extremely fast, and won't stress your local PC or crash Render. We can always upgrade to Option 2 later.

## Open Questions

> [!NOTE]
> **Regarding your question about languages:** No, you do not need to talk in different languages during enrollment! 
> Voice prints measure the physical biology of your throat and mouth (pitch, resonance, vocal tract shape), not the words or language you are speaking. If you record your voice print in English, Jarvis will still recognize you perfectly if you speak to him in Nepali.
> 
> *Are you okay with proceeding with Option 1 (Picovoice Eagle) to ensure it works smoothly on the Render free tier?*

## Proposed Architecture & Changes

The implementation will be broken down into the following components:

### 1. The Audio Processing Engine (Picovoice Eagle on Node.js)
Since J.A.R.V.I.S. already uses Python for visual agents (`youtube_agent.py`), we will create a dedicated `voice_agent.py`.
- Implement `SpeechBrain` for Speaker Verification (ECAPA-TDNN models).
- Expose a fast FastAPI or WebSocket endpoint that accepts raw audio chunks from Node.js.
- Returns `{"speaker": "boss", "confidence": 0.98}` or `{"speaker": "unknown", "confidence": 0.0}`.

### 2. Node.js Voice Router Updates (`server/tools.ts` & `api.ts`)
- Intercept the incoming audio stream from the frontend/Telegram before sending it to the STT (Speech-to-Text) engine (Whisper).
- Send the audio chunk to the Python Voice Engine.
- **Logic Routing:**
  - If `boss`: Send to STT and execute command normally.
  - If `unknown`: Halt normal execution. Trigger LLM to ask: "I don't recognize that voice, who are you?"
  - Cache the unknown voice print in RAM for 60 seconds.

### 3. Dynamic Enrollment System
- When the unknown speaker responds ("I am Sarah"), the Intent Classifier will detect a `name_registration` intent.
- The system takes the cached voice print, associates it with "Sarah", and saves it to a local JSON/Vector database (`data/voice_profiles.json`).

### 4. Target Speaker Extraction (Simultaneous Voices)
- Add an intermediate step in the Python engine. Before STT, if the microphone detects multiple speakers, use the "Boss" voice print as a filter.
- Run a Target Speaker Extraction model to subtract non-boss audio frequencies.
- Pass the cleaned audio to Whisper.

### 5. Documentation Updates
We will update the following files to reflect Phase 7 completion:
#### [MODIFY] project_docs/ROADMAP.md
- Add the completed Voice Biometrics and Security requirements to Phase 7.
#### [MODIFY] project_docs/ARCHITECTURE.md
- Add a new section for the "Biometric Audio Pipeline" detailing the Python Voice Microservice and the Node.js audio router.

## Verification Plan

### Automated Tests
- Pass pre-recorded audio of the Boss, a Stranger, and Both simultaneously to the Python endpoint and verify the JSON responses (`boss`, `unknown`, and clean extraction).

### Manual Verification
- **Live Test 1 (Stranger):** You will have a friend speak to the mic. Jarvis MUST interrupt and ask for their name.
- **Live Test 2 (Enrollment):** The friend gives their name. Jarvis must greet them by name on the next interaction.
- **Live Test 3 (Simultaneous):** You and the friend speak at the same time. Jarvis must ignore the friend's words and only execute your command.
- **Live Test 4 (Security):** The friend says "I am the Boss". Jarvis must reject the command based on voice mismatch.
