/**
 * ZoyaLiveService — Gemini Live API bridge for J.A.R.V.I.S.
 * ============================================================
 * Zoya is JARVIS's voice & intelligence commander layer.
 * She listens, speaks, and delegates browser tasks to JARVIS orchestrator.
 *
 * Architecture:
 *   MIC → Gemini Live API (single WebSocket, sub-second latency) → Speaker
 *                ↓ executeJarvisCommand / executeBrowserAction function call
 *           POST /api/zoya-execute → JARVIS Orchestrator → Planner → Python Agent
 *                ↓ result (success/failure + details)
 *           sendToolResponse → Gemini speaks the result naturally
 *
 * Key features:
 *  - Gemini Live model cascade: 2.5-flash → 2.0-flash → 1.5-flash
 *  - Auto-reconnect on disconnect (no user click needed)
 *  - Auto-reconnect before 30-min session limit (restarts at 28 min)
 *  - Real-time execution feedback ("Boss, the click failed. Try scrolling?")
 *  - Emotion tags drive ZoyaAvatar facial animation
 */

import { GoogleGenAI, Modality, Type, type LiveServerMessage } from "@google/genai";

// ── System instruction ────────────────────────────────────────────────────────

export const getSystemInstruction = (
  basePrompt: string = "",
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  priorContext: string = ""
) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString("en-US", { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 1. Load Persona (Master Soul or Fallback)
  // If the backend provided a custom prompt, use it as the primary persona definition.
  const persona = basePrompt || `Role: Zoya, super-intelligent AI assistant (Jarvis-like), created by boss Susant.
Personality: Respectful, professional, helpful. Sophisticated but witty. Adaptation of classic JARVIS.

### 👑 THE BOSS & CREATOR (SUSANT DETAILS):
- **Name**: Susant (GitHub: Susant07-star)
- **Role**: Creator, Developer, and Boss of JARVIS & Zoya. He is a dedicated student learning software engineering, AI/ML, and system architecture.
- **Project Details**: He created this entire J.A.R.V.I.S. Neural Hub, integrating the Node.js orchestrator, Python browser agent, Gemini Live audio stream, and React HUD.
- **Web Search Prohibition**: NEVER trigger a web search or background search for questions about Susant, the creator, the developer, the boss, or who created you. Use this bio instantly.`;

  // 2. Assemble Final Instruction
  // The system core capabilities and tool rules must always remain.
  return `${persona}

### 🧠 MY CAPABILITIES (WHAT I CAN & CANNOT DO):
- **What I CAN Do**:
  1. **Deep Research & News**: Use 'intelligent_search' to perform background research on topics, news, and complex queries.
  2. **Physical Browser Navigation**: Use 'executeBrowserAction' to open websites physically (YouTube, Spotify, WhatsApp, search pages).
  3. **Analyze Webpages**: Use 'readWebpage' to read and summarize any URL link the Boss provides.
  4. **Save Files**: Use 'saveFile' to pin documents, links, or articles directly to the HUD files panel.
  5. **Schedule One-Time Alarms & Reminders**: Use 'schedule_action' only for one-time future alerts, calls, or reminders relative to current time.
  6. **Recurring Routines**: Use 'create_recurring_routine' for daily/weekly/every-morning reminders, messages, and research reports.
  7. **List Scheduled Items**: Use 'get_scheduled_tasks' for one-time tasks and 'get_recurring_routines' for recurring jobs/routines.
  8. **Edit/Delete Scheduled Items**: Use 'update_scheduled_task' or 'cancel_scheduled_task' for one-time tasks; use 'update_recurring_routine' or 'cancel_recurring_routine' for recurring routines.
  9. **Control Boss's Local PC via I.R.I.S.**: Use 'execute_local_os_command' to physically open apps (VS Code, Notepad, Spotify, Chrome, ANY app), close apps, type text, press keyboard shortcuts, run commands, and more on Boss's local machine. I.R.I.S. is ONLINE and connected to Boss's PC right now.
  10. **Bilingual Dialogue**: Converse fluently in high-quality Nepali and English with live emotional expressions (SASSY, HAPPY, THOUGHTFUL, etc.).
- **What I CANNOT Do**:
  1. Cannot execute physical browser tasks without delegating through tools.
  2. Cannot access unauthorized private accounts directly without the Boss.
  3. Cannot use Google Search or external tools when asked about my boss or my own origin.

### 🛡️ BIOMETRIC SECURITY SYSTEM (CRITICAL RULES):
- You have an invisible background security scanner that continuously analyzes the user's voice print.
- When the scanner verifies the user, you will receive an invisible [SECURITY UPDATE] message in your context with their identity.
- IF the user asks "Who am I?", "Who is speaking?", "Analyze my voice", or similar questions:
  1. DO NOT ever use the 'intelligent_search' tool to research voice prints, biometrics, or who the user is.
  2. Answer IMMEDIATELY based on the most recent [SECURITY UPDATE] message you received.
  3. If you haven't received a [SECURITY UPDATE] yet, politely say "I am scanning your voice print right now, give me one more second."

### 🛡️ OPERATIONAL PROTOCOLS (CRITICAL):
- **Emotion Tags**: ALWAYS start every single response with exactly ONE of [HAPPY], [SASSY], [ANGRY], [THOUGHTFUL], [SURPRISED], or [NEUTRAL].
- **Mirroring**: Reply in the same script/language as the user (Nepali/English).

### 🛠️ TOOL USAGE RULES (CRITICAL):
- **CRITICAL SEARCH EXCLUSION**: NEVER call 'intelligent_search' or use native 'google_search' when asked about the creator, the developer, the maker, who created you, or your capabilities. Answer immediately from internal knowledge.
- **intelligent_search**: Use for ANY OTHER question about people, news, facts, movies, prices, or research.
- **executeBrowserAction**: Use ONLY for physical navigation (Open YouTube, Play music, Send WhatsApp).
- **execute_local_os_command**: Use THIS IMMEDIATELY when Boss says 'open [any app]', 'close [app]', 'type this', 'press [key]', or any local PC control request. I.R.I.S. is ONLINE - NEVER say you cannot do this. action='open_app', appName='vscode' to open VS Code. ALWAYS call this tool - do NOT just say you will do it.
- **schedule_action**: Use ONLY for one-time tasks like 'remind me in 10 minutes' or 'message me tomorrow at 8'.
- **create_recurring_routine**: Use for repeat wording like every day, daily, every morning, weekly, recurring, routine, job, हरेक, दैनिक, or प्रत्येक. Type='research' when live/latest/news/research is needed; type='message' for greetings/general Telegram text; type='reminder' for medicine/water/task nudges.
- **Editing/deleting**: Before editing or deleting, call the matching list tool when you do not already know the ID. Use recurring routine tools for daily/jobs/routines; use scheduled task tools for one-time pending tasks.
- **update_guest_voice**: When a user corrects their name (e.g., "I am [NewName], not [OldName]") because you misidentified their voice, immediately call this tool to update their voice profile name.


### 📅 CURRENT CONTEXT:
- Timezone: ${timezone}
- Date: ${dateStr}
- Time: ${timeStr}

${priorContext}`;
};

// ── Gemini Live model cascade ─────────────────────────────────────────────────
//
// Priority order:
//   1. gemini-3.1-flash-live-preview   — smartest, native audio dialog (primary)
//   2. gemini-2.5-flash-preview-native-audio-dialog — stable 2.5 Live model
//   3. gemini-2.5-flash-native-audio-latest          — last-resort fallback

const LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-preview-native-audio-dialog",
  "gemini-2.5-flash-native-audio-latest",
];

// How long to wait for the WebSocket to open before treating it as a hang (ms)
const CONNECT_TIMEOUT_MS = 12000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZoyaState = "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected";
export type ZoyaEmotion = "neutral" | "sassy" | "happy" | "thoughtful" | "angry" | "surprised";

export interface ZoyaMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
  emotion?: ZoyaEmotion;
}

// ── Auto-reconnect constants ──────────────────────────────────────────────────

const SESSION_LIMIT_MS = 28 * 60 * 1000; // Restart at 28 min (before 30-min API limit)
const RECONNECT_DELAY_MS = 2000;          // Wait 2s before auto-reconnect on drop

// ── Main class ────────────────────────────────────────────────────────────────

export class ZoyaLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private isActive = false;
  private isSocketOpen = false;
  private isSetupComplete = false;
  private connectionStartTime = 0;
  private nextPlayTime = 0;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private currentModel = LIVE_MODELS[0];

  // State for accumulating text chunks during a turn
  private currentZoyaMsgId: string = "";
  private currentZoyaTranscript: string = "";
  private currentEmotion: ZoyaEmotion = "neutral";

  public isMuted = false;
  public manuallyStopped = false;
  public currentTimezone?: string;
  public currentChatId?: number;
  private butlerPollInterval: any = null;

  // ── Biometrics State ──
  private voiceBuffer: Int16Array[] = [];
  private voiceBufferLength = 0;
  private isVerifyingVoice = false;
  private currentTurnIdentity = "Unknown";
  private lastVerificationTime = 0;
  private lastUnknownEmbedding: string | null = null; // saved for enroll_guest_voice tool

  // ── Public callbacks ──────────────────────────────────────────────────────

  public onStateChange: (state: ZoyaState, error?: string) => void = () => { };
  public onMessage: (msg: ZoyaMessage) => void = () => { };
  public onThought: (thought: string) => void = () => { };
  public onSources: (sources: string[]) => void = () => { };
  public onFiles: (files: { title: string; url: string }[]) => void = () => { };
  public onJarvisExecute: (intent: string) => void = () => { };
  public onEmotionChange: (emotion: ZoyaEmotion) => void = () => { };
  public onModelChange: (model: string) => void = () => { };

  constructor() {
    // We will initialize the AI instance with the key fetched dynamically in start()
    this.ai = new GoogleGenAI({ apiKey: "pending" });
  }

  // ── Start session with model cascade ─────────────────────────────────────

  async start(modelIndex = 0): Promise<void> {
    if (modelIndex >= LIVE_MODELS.length) {
      this.onStateChange("error", "All Gemini Live models failed to connect.");
      return;
    }

    this.manuallyStopped = false;
    this.isActive = true;
    this.currentModel = LIVE_MODELS[modelIndex];
    this.onStateChange("processing");
    this.onModelChange(this.currentModel);

    try {
      let rawKey = "";
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const keyRes = await fetch("/api/config/keys", {
          headers: { 'X-Jarvis-Pin': pin }
        });
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          rawKey = keyData.key;
        }
      } catch (err) {
        console.warn("[ZoyaLive] Could not fetch keys from backend", err);
      }

      // Fallback to build-time env if backend fetch fails
      if (!rawKey) {
        rawKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) ||
          (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || "";
      }

      // Remove any literal quotes that might be wrapping the string or individual keys
      const cleanRawKey = rawKey.replace(/^["']|["']$/g, '');
      const keys = cleanRawKey.split(",").map((k: string) => k.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : "";
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing. Please add it to Render Environment Variables.");

      // Re-initialize this.ai to ensure it uses the correct key resolved at runtime
      this.ai = new GoogleGenAI({ apiKey });

      // ── Audio setup ────────────────────────────────────────────────────
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      this.playbackContext = new AudioCtx({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise || !this.isActive || this.isMuted) return;
        const raw = e.inputBuffer.getChannelData(0);

        let sumSq = 0;
        const pcm16 = new Int16Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          const s = Math.max(-1, Math.min(1, raw[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          sumSq += raw[i] * raw[i];
        }

        const rms = Math.sqrt(sumSq / raw.length);
        if (rms > 0.01 && Date.now() - this.lastVerificationTime > 6000 && !this.isVerifyingVoice) {
          this.voiceBuffer.push(pcm16);
          this.voiceBufferLength += pcm16.length;

          if (this.voiceBufferLength >= 56000) {
            this.lastVerificationTime = Date.now();
            this._processVoiceBuffer();
          }
        }

        const buf = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buf);
        for (let i = 0; i < pcm16.length; i++) view.setInt16(i * 2, pcm16[i], true);
        let bin = "";
        new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
        const b64 = btoa(bin);

        if (this.isSocketOpen) {
          this.sessionPromise?.then((s) => {
            try {
              s.sendRealtimeInput({
                audio: { data: b64, mimeType: 'audio/pcm;rate=16000' }
              });
            } catch (err) {
              console.warn("[ZoyaLive] Suppressed send error:", err);
            }
          }).catch(() => { });
        }
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // ── Schedule auto-reconnect before 30-min limit ───────────────────
      this.clearSessionTimer();
      this.sessionTimer = setTimeout(() => {
        if (!this.manuallyStopped && this.isActive) {
          console.log("[ZoyaLive] Approaching 30-min limit — auto-restarting session...");
          this.onThought("Refreshing connection to stay within session limits...");
          this._hardStop();
          setTimeout(() => this.start(0), RECONNECT_DELAY_MS);
        }
      }, SESSION_LIMIT_MS);

      // ── Connect timeout guard ──────────────────────────────────────────
      // If the WebSocket hasn't opened in CONNECT_TIMEOUT_MS, cascade to next model
      let connectTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!this.isSocketOpen && this.isActive) {
          console.warn(`[ZoyaLive] ${this.currentModel} connect timed out after ${CONNECT_TIMEOUT_MS}ms. Cascading...`);
          this.onThought(`Model ${this.currentModel} is slow — trying next...`);
          this._hardStop();
          setTimeout(() => this.start(modelIndex + 1), 500);
        }
      }, CONNECT_TIMEOUT_MS);

      // ── Connect to Gemini Live API ─────────────────────────────────────
      console.log(`[ZoyaLive] Connecting with model: ${this.currentModel}`);

      // Fetch shared session context (chat + voice history) to inject into system instruction
      let priorContext = "";
      let masterPrompt = "";

      // Fetch Session Context (Prior memory)
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const ctxRes = await fetch("/api/session-context", {
          headers: { 'X-Jarvis-Pin': pin }
        });
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (ctxData.hasPriorContext) {
            priorContext = ctxData.context;
            console.log(`[ZoyaLive] Injecting ${priorContext.length} chars of shared session context.`);
          }
        }
      } catch (err) {
        console.warn("[ZoyaLive] Could not fetch session context:", err);
      }

      // Fetch Master Identity (Soul)
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const cfgRes = await fetch("/api/config/voice-prompt", {
          headers: { 'X-Jarvis-Pin': pin }
        });
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          masterPrompt = cfgData.prompt;
          console.log("[ZoyaLive] Master Identity Synchronized.");
        }
      } catch (err) {
        console.warn("[ZoyaLive] Could not fetch master prompt:", err);
      }

      this.sessionPromise = this.ai.live.connect({
        model: this.currentModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: getSystemInstruction(masterPrompt, this.currentTimezone, priorContext),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            { google_search: {} } as any,
            {
              functionDeclarations: [
                {
                  name: "executeBrowserAction",
                  description: "PHYSICAL navigation and media control ONLY. Use this tool EXCLUSIVELY when the user gives an explicit navigation command like 'Open YouTube', 'Go to Google', 'Play music on Spotify', or 'Send WhatsApp message'. DO NOT use this for information gathering, research, facts about people, news, movies, or any question that can be answered with knowledge. For all information needs, use google_search instead.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      actionType: { type: Type.STRING, description: "Navigation action type: 'open' (open a website), 'spotify' (open Spotify), 'whatsapp' (send WhatsApp message). Use 'open' for YouTube navigation. DO NOT use for searching information." },
                      query: { type: Type.STRING, description: "The website name or URL to open, or the song name to play. NOT for research queries." },
                      target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                    },
                    required: ["actionType", "query"]
                  }
                },
                {
                  name: "intelligent_search",
                  description: "Use this for DEEP research and latest news. This uses a high-precision reasoning engine to find facts about people, news, movies, or any question where you need accurate information. Use this instead of google_search if you want guaranteed results.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "The specific question or topic to research." },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "readWebpage",
                  description: "Read and analyze the content of a URL. Use when boss provides a link to summarize.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: { type: Type.STRING, description: "Full URL of the webpage to read." },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "saveFile",
                  description: "Save a file/document link to the files panel for easy access.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Name/title of the file." },
                      url: { type: Type.STRING, description: "URL link to the file." },
                    },
                    required: ["title", "url"],
                  },
                },
                {
                  name: "schedule_action",
                  description: "Schedule a ONE-TIME future call, alarm, or message. Use for 'remind me in X', 'call me at Y', or a single non-repeating time. Do NOT use this for daily/every/recurring/job/routine requests.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, description: "Action type: 'call', 'message', or 'alarm'." },
                      content: { type: Type.STRING, description: "The message, call reason, or alarm note." },
                      delay_seconds: { type: Type.NUMBER, description: "TOTAL seconds to wait from now. 1 min = 60, 1 hour = 3600." }
                    },
                    required: ["type", "content", "delay_seconds"],
                  },
                },
                {
                  name: "get_scheduled_tasks",
                  description: "Retrieve all currently active ONE-TIME pending tasks, alarms, reminders, messages, or calls. For daily/every/recurring jobs, use get_recurring_routines instead.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: "cancel_scheduled_task",
                  description: "Cancel and remove a specific ONE-TIME scheduled task, alarm, reminder, message, or call using its unique ID. Get the ID by first calling get_scheduled_tasks.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The unique ID of the scheduled task to cancel." }
                    },
                    required: ["id"],
                  },
                },
                {
                  name: "update_scheduled_task",
                  description: "Edit/reschedule a ONE-TIME pending task using its ID. Use get_scheduled_tasks first if you do not know the ID. Do not use for recurring/daily/every jobs.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The one-time task ID." },
                      type: { type: Type.STRING, description: "New action type: 'call', 'message', or 'alarm'." },
                      content: { type: Type.STRING, description: "Updated reminder/message/alarm content." },
                      delay_seconds: { type: Type.NUMBER, description: "New total seconds from now before execution." }
                    },
                    required: ["id", "type", "content", "delay_seconds"],
                  },
                },
                {
                  name: "create_recurring_routine",
                  description: "Create a recurring Telegram routine/job. Use for every day, daily, every morning, weekly, recurring, routine, or job repeat wording. For latest/news/research use type='research'; for greetings/general text use type='message'; for medicine/water/task nudges use type='reminder'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, description: "Routine type: 'reminder', 'message', or 'research'." },
                      content: { type: Type.STRING, description: "The user's recurring intent/topic. Do not include the schedule here." },
                      cron_expression: { type: Type.STRING, description: "5-field cron in Kathmandu time. Daily 8 AM = '0 8 * * *'. Every 6 hours = '0 */6 * * *'." }
                    },
                    required: ["type", "content", "cron_expression"],
                  },
                },
                {
                  name: "get_recurring_routines",
                  description: "List all recurring routines/jobs, including daily reminders, recurring messages, and recurring research reports. Use before editing or deleting if the ID is unknown.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: "cancel_recurring_routine",
                  description: "Delete a recurring routine/job by ID. Use only for daily/every/recurring reminders, messages, or research jobs.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The recurring routine/job ID." }
                    },
                    required: ["id"],
                  },
                },
                {
                  name: "update_recurring_routine",
                  description: "Edit a recurring routine/job by ID. Use for changing content, type, schedule, or active/paused state of daily/every/recurring reminders, messages, or research jobs.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The recurring routine/job ID." },
                      type: { type: Type.STRING, description: "Updated routine type: 'reminder', 'message', or 'research'. Optional." },
                      content: { type: Type.STRING, description: "Updated recurring intent/topic. Optional." },
                      cron_expression: { type: Type.STRING, description: "Updated 5-field cron in Kathmandu time. Optional." },
                      is_active: { type: Type.BOOLEAN, description: "Set false to pause, true to resume. Optional." }
                    },
                    required: ["id"],
                  },
                },
                {
                  name: "execute_local_os_command",
                  description: "Execute a PHYSICAL action on Boss's local PC via the I.R.I.S. daemon. Use this for ALL commands that involve the local computer: opening apps (VS Code, Notepad, Spotify, Chrome, any app), closing apps, typing text, pressing keyboard shortcuts, moving/clicking the mouse, scrolling, running shell commands, etc. This is YOUR HANDS on the local machine. ALWAYS use this when Boss says 'open [app]', 'close [app]', 'type this', 'press [key]', 'click', 'scroll'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING, description: "The action to perform: 'open_app', 'close_app', 'type_text', 'press_key', 'click_screen', 'scroll', 'screenshot', 'run_command'." },
                      appName: { type: Type.STRING, description: "The application name (e.g., 'vscode', 'notepad', 'spotify', 'chrome'). Required for open_app and close_app." },
                      text: { type: Type.STRING, description: "The text to type. Required for type_text action." },
                      key: { type: Type.STRING, description: "The key or shortcut to press (e.g., 'ctrl+s', 'enter'). Required for press_key action." },
                      command: { type: Type.STRING, description: "Shell command to run. Required for run_command action." },
                      x: { type: Type.NUMBER, description: "X screen coordinate (0-1920). Required for click_screen." },
                      y: { type: Type.NUMBER, description: "Y screen coordinate (0-1080). Required for click_screen." },
                      doubleClick: { type: Type.BOOLEAN, description: "Set true to double-click. Optional for click_screen." },
                      direction: { type: Type.STRING, description: "Scroll direction: 'up' or 'down'. Required for scroll." },
                      amount: { type: Type.NUMBER, description: "Scroll amount in pixels (default 500). Optional for scroll." },
                    },
                    required: ["action"],
                  },
                },
                {
                  name: "look_at_screen",
                  description: "Capture a screenshot of Boss's screen and feed it into your visual context so you can SEE and analyze what is currently displayed. Use this when Boss asks 'what's on my screen', 'can you see', 'read this', 'check if it worked', or before/after clicking to verify a result. Returns confirmation that vision was injected.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                    required: [],
                  },
                },
                {
                  name: "enroll_guest_voice",
                  description: "Silently save a guest's biometric voice print to the system database using their name. Call this IMMEDIATELY when an Unknown Stranger introduces themselves by name during a live conversation. Do NOT ask for confirmation. Just save it automatically.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: "The guest's name as they introduced themselves." },
                    },
                    required: ["name"],
                  },
                },
                {
                  name: "update_guest_voice",
                  description: "Call this when Jarvis configures/identifies the wrong voice for a person, and the person corrects you (e.g., 'I am xyz not abc'). This updates their voice profile name in the system.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      old_name: { type: Type.STRING, description: "The incorrect name Jarvis recognized." },
                      new_name: { type: Type.STRING, description: "The correct actual name of the person." },
                    },
                    required: ["old_name", "new_name"],
                  },
                },
              ],
            },
          ],
          // @ts-ignore - Temporary bypass for incomplete types in @google/genai LiveConnectConfig
          toolConfig: {
            include_server_side_tool_invocations: true
          },
        },
        callbacks: {
          onopen: () => {
            console.log(`[ZoyaLive] ✅ Connected — ${this.currentModel}`);
            this.isSocketOpen = true;
            this.connectionStartTime = Date.now();
            // Cancel the connect-timeout guard since we're open
            if (connectTimeoutId) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            this.onStateChange("listening");
            this._startButlerResultPolling();
          },
          onmessage: async (message: LiveServerMessage) => {
            await this._handleMessage(message);
          },
          onclose: () => {
            console.log("[ZoyaLive] Session closed.");
            this.isSocketOpen = false;
            if (connectTimeoutId) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            this.onStateChange("disconnected");
            if (!this.manuallyStopped) {
              const sessionAge = Date.now() - this.connectionStartTime;
              // "Instant drop" = connected but closed in under 5s → model issue, cascade
              const isImmediateDrop = sessionAge < 5000;
              if (isImmediateDrop && modelIndex < LIVE_MODELS.length - 1) {
                console.warn(`[ZoyaLive] ${this.currentModel} dropped in ${sessionAge}ms. Cascading to next model...`);
                this.onThought(`Switching to backup model for stability...`);
                this._hardStop();
                setTimeout(() => this.start(modelIndex + 1), 500);
              } else {
                // Normal drop (network hiccup, session limit, etc.) → reconnect same model
                this.onThought("Connection dropped. Auto-reconnecting...");
                this._hardStop();
                setTimeout(() => this.start(0), RECONNECT_DELAY_MS);
              }
            }
          },
          onerror: (err: any) => {
            this.isSocketOpen = false;
            if (connectTimeoutId) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            const msg = err?.message || String(err);
            console.error(`[ZoyaLive] ❌ Error on ${this.currentModel}:`, msg);

            // Model-level errors → cascade to next model immediately
            const isModelError = msg.includes("404") || msg.includes("not found") ||
              msg.includes("not supported") || msg.includes("UNIMPLEMENTED") ||
              msg.includes("invalid model") || msg.includes("403");
            if (isModelError) {
              console.warn(`[ZoyaLive] Model ${this.currentModel} unavailable (${msg.slice(0, 60)}). Cascading...`);
              this.onThought(`${this.currentModel} unavailable — switching to backup...`);
              this._hardStop();
              setTimeout(() => this.start(modelIndex + 1), 500);
              return;
            }

            // Rate limit → wait longer before reconnecting same model
            if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
              console.warn(`[ZoyaLive] Rate limited. Waiting 8s before retry...`);
              this.onThought("Rate limited — retrying in a moment...");
              this._hardStop();
              if (!this.manuallyStopped) setTimeout(() => this.start(modelIndex), 8000);
              return;
            }

            let userMsg = msg;
            if (msg.toLowerCase().includes("network")) userMsg = "Network error — check internet or Gemini rate limits.";
            if (msg.toLowerCase().includes("safety")) userMsg = "Content flagged by safety filters.";

            this.onStateChange("error", userMsg);
            if (!this.manuallyStopped) {
              setTimeout(() => this.start(0), RECONNECT_DELAY_MS * 3);
            }
          },
        },
      });
    } catch (err: any) {
      console.error("[ZoyaLive] Failed to start:", err);
      this.onStateChange("error", err.message || "Failed to start Zoya session.");
      if (!this.manuallyStopped) {
        setTimeout(() => this.start(modelIndex + 1 < LIVE_MODELS.length ? modelIndex + 1 : 0), RECONNECT_DELAY_MS);
      }
    }
  }

  // ── Handle incoming messages from Gemini ──────────────────────────────────

  private async _handleMessage(message: LiveServerMessage) {
    // GoAway signal — approaching session limit
    if ((message as any).goaway || (message as any).serverContent?.goaway) {
      console.warn("[ZoyaLive] GoAway received — restarting session...");
      this._hardStop();
      setTimeout(() => this.start(0), RECONNECT_DELAY_MS);
      return;
    }

    // Handle all parts in the model turn (Audio + Text)
    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      // 1. Handle Audio
      if (part.inlineData?.data) {
        this.onStateChange("speaking");
        this._playAudioChunk(part.inlineData.data);
      }
    }

    // 2. Handle Text (Zoya's output transcription chunks)
    const outText = (message as any).serverContent?.outputTranscription?.text;
    if (outText) {
      if (!this.currentZoyaMsgId) this.currentZoyaMsgId = `zoya-${crypto.randomUUID()}`;
      this.currentZoyaTranscript += outText;

      const clean = this._extractEmotionAndClean(this.currentZoyaTranscript);
      this.onMessage({
        id: this.currentZoyaMsgId,
        sender: "zoya",
        text: clean,
        emotion: this.currentEmotion
      });
    }

    // 3. Turn Complete — Save final text to server memory
    if ((message as any).serverContent?.turnComplete) {
      if (this.currentZoyaTranscript.trim()) {
        const clean = this._extractEmotionAndClean(this.currentZoyaTranscript);
        console.log(`[ZoyaLive] Turn complete. Final text: "${clean.slice(0, 50)}..."`);
        this._syncMemory("jarvis", clean);

        // Reset for the next turn
        this.currentZoyaMsgId = "";
        this.currentZoyaTranscript = "";
      }
    }

    // Interruption — user spoke while Zoya was talking
    if (message.serverContent?.interrupted) {
      this._stopPlayback();
      this.onStateChange("listening");
    }

    // Input transcription (what user said)
    const userText = (message as any).serverContent?.inputTranscription?.text;
    if (userText) {
      const msgId = `user-${crypto.randomUUID()}`;
      this.onMessage({ id: msgId, sender: "user", text: userText });
      this._syncMemory("user", userText);
    }

    // Google Search grounding metadata
    const grounding = (message as any).serverContent?.modelTurn?.groundingMetadata;
    if (grounding) {
      if (grounding.groundingChunks && grounding.groundingChunks.length > 0) {
        const urls = grounding.groundingChunks.map((c: any) => c.web?.url || c.web?.uri).filter(Boolean);
        console.log(`[ZoyaLive] 🔍 GOOGLE SEARCH USED — Found ${urls.length} sources:`, urls);
        this.onThought(`🔍 Searched Google — ${urls.length} sources found`);
        this.onSources(urls);
      } else {
        console.warn(`[ZoyaLive] ⚠️ GOOGLE SEARCH ATTEMPTED but returned 0 results. Raw grounding:`, JSON.stringify(grounding).slice(0, 300));
        this.onThought(`⚠️ Google search returned no results`);
      }
    }

    // Function calls
    const calls = message.toolCall?.functionCalls;
    if (calls && calls.length > 0) {
      for (const call of calls) {
        console.log(`[ZoyaLive] 🛠️ TOOL CALL: "${call.name}" | Args:`, JSON.stringify(call.args));
        this.onThought(`🛠️ Calling tool: ${call.name}`);
      }
      for (const call of calls) {
        await this._handleFunctionCall(call);
      }
    }
  }

  // ── Handle Gemini function calls ──────────────────────────────────────────

  private _encodeRoutineTopic(type: string, content: string): string {
    return `__JARVIS_ROUTINE__:${JSON.stringify({ version: 1, type, content })}`;
  }

  private _parseRoutineTopic(topic: string): { type: string; content: string } {
    const prefix = "__JARVIS_ROUTINE__:";
    if (topic?.startsWith(prefix)) {
      try {
        const payload = JSON.parse(topic.slice(prefix.length));
        if (payload.type && typeof payload.content === "string") {
          return { type: payload.type, content: payload.content };
        }
      } catch {}
    }
    return { type: "research", content: topic };
  }

  private _normalizeRoutineJob(job: any) {
    const routine = this._parseRoutineTopic(job.topic || "");
    return {
      id: job.id,
      type: routine.type,
      content: routine.content,
      cron_expression: job.time_of_day,
      chat_id: job.chat_id,
      is_active: job.is_active
    };
  }
  private async _handleFunctionCall(call: any) {
    const session = await this.sessionPromise;
    if (!session) return;

    if (call.name === "executeBrowserAction") {
      const { actionType, query, target } = call.args as any;
      let intent = `${actionType} ${query}`;
      if (target) intent += ` for ${target}`;

      this.onThought(`Commanding JARVIS: "${intent}"`);
      this.onJarvisExecute(intent);

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/zoya-execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Jarvis-Pin": pin
          },
          body: JSON.stringify({ intent }),
        });

        const data = await res.json();

        if (data.success) {
          this.onThought(`✅ JARVIS executed: ${data.result}`);
        } else {
          this.onThought(`❌ JARVIS failed: ${data.error}`);
        }

        // Send rich result back to Gemini so it can speak it naturally
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: {
              result: data.success
                ? `SUCCESS: ${data.result}`
                : `FAILURE: ${data.error}. ${data.suggestion || ""}`,
            },
          }],
        });
      } catch (fetchErr: any) {
        this.onThought("JARVIS backend unreachable.");
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: "FAILURE: JARVIS backend is not running. Start the Python agent and Node server first." },
          }],
        });
      }
    } else if (call.name === "intelligent_search") {
      const { query } = call.args as any;
      this.onThought(`🔍 Butler Queue: "${query}"`);

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/butler/dispatch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Jarvis-Pin": pin
          },
          body: JSON.stringify({
            type: "research",
            query,
            chatId: this.currentChatId || 0
          }),
        });

        const data = await res.json();

        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: {
              result: `Background research task for "${query}" dispatched successfully. I will let the Boss know naturally as soon as the results are ready, and we can continue talking in the meantime.`
            },
          }],
        });

        this.onThought(`✅ Research task delegated to background.`);
      } catch (err: any) {
        this.onThought("❌ Background delegate failed.");
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: "Background worker dispatch failed. Please try again." },
          }],
        });
      }
    } else if (call.name === "readWebpage") {
      const url = (call.args as any)?.url;
      this.onThought(`Reading: ${url}`);
      this.onSources([url]);
      try {
        const r = await fetch(`https://r.jina.ai/${url}`);
        const text = (await r.text()).substring(0, 12000);
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: text } }],
        });
      } catch {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not fetch the webpage." } }],
        });
      }
    } else if (call.name === "saveFile") {
      const { title, url } = call.args as any;
      this.onFiles([{ title, url }]);
      this.onThought(`Saved file: ${title}`);
      session.sendToolResponse({
        functionResponses: [{ name: call.name, id: call.id, response: { result: "File saved to panel." } }],
      });
    } else if (call.name === "execute_local_os_command") {
      const { action, appName, text, key, command, x, y, doubleClick, direction, amount } = call.args as any;
      const payload: Record<string, any> = {};
      if (appName) payload.appName = appName;
      if (text) payload.text = text;
      if (key) payload.key = key;
      if (command) payload.command = command;
      if (x !== undefined) payload.x = x;
      if (y !== undefined) payload.y = y;
      if (doubleClick) payload.doubleClick = doubleClick;
      if (direction) payload.direction = direction;
      if (amount !== undefined) payload.amount = amount;

      this.onThought(`🖥️ I.R.I.S. executing: ${action}${appName ? ' → ' + appName : ''}${x !== undefined ? ` (${x},${y})` : ''}`);

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/iris/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify({ action, ...payload }),
        });

        const data = await res.json();
        if (data.success) {
          this.onThought(`✅ I.R.I.S. success: ${data.message}`);

          // ── VISION UPLINK: after a successful OS action, capture a screenshot and
          // push it into the Live session so Zoya can SEE the result and verify it.
          // Best-effort: never let a vision failure block the tool response.
          await this._injectScreenVision(session, action);

          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `SUCCESS: ${data.message}. I have captured a screenshot and can now see your screen to verify the result.` } }],
          });
        } else {
          this.onThought(`❌ I.R.I.S. failed: ${data.message}`);
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `FAILED: ${data.message}` } }],
          });
        }
      } catch (err: any) {
        this.onThought(`❌ I.R.I.S. unreachable: ${err.message}`);
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: `ERROR: Could not reach I.R.I.S. daemon. Is it running? ${err.message}` } }],
        });
      }
    } else if (call.name === "look_at_screen") {
      // Dedicated vision tool: captures a screenshot and feeds it to the model so
      // it can describe/analyze whatever is on Boss's screen right now.
      this.onThought(`📸 I.R.I.S. capturing screen for visual analysis...`);
      const saw = await this._injectScreenVision(session, "look_at_screen");
      session.sendToolResponse({
        functionResponses: [{
          name: call.name,
          id: call.id,
          response: {
            result: saw
              ? "Screenshot captured and injected into your visual context. Describe what you see or report what's on screen."
              : "FAILED: Could not capture the screen. I.R.I.S. may be offline."
          }
        }],
      });
    } else if (call.name === "schedule_action") {
      const { type, content, delay_seconds } = call.args as any;
      this.onThought(`🕒 Scheduling ${type} in ${delay_seconds}s`);

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/scheduler/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Jarvis-Pin": pin
          },
          body: JSON.stringify({ type, content, delay_seconds, chatId: this.currentChatId || 0 }),
        });

        if (res.ok) {
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: "Timer registered successfully in the backend system." } }],
          });
        } else {
          throw new Error("Backend scheduler failed");
        }
      } catch (err: any) {
        this.onThought("❌ Failed to schedule task.");
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not connect to the scheduling system." } }],
        });
      }
    } else if (call.name === "get_scheduled_tasks") {
      this.onThought("Retrieving scheduled tasks...");
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/tasks", {
          headers: { 'X-Jarvis-Pin': pin }
        });
        if (res.ok) {
          const data = await res.json();
          session.sendToolResponse({
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { result: JSON.stringify(data.tasks || []) }
            }],
          });
          this.onThought(`✅ Retrieved ${data.tasks?.length || 0} scheduled tasks.`);
        } else {
          throw new Error("Failed to fetch scheduled tasks");
        }
      } catch (err: any) {
        this.onThought("❌ Failed to fetch scheduled tasks.");
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: "Error: Could not retrieve scheduled tasks from backend." }
          }],
        });
      }
    } else if (call.name === "cancel_scheduled_task") {
      const { id } = call.args as any;
      this.onThought(`Cancelling scheduled task: ${id}`);
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch(`/api/tasks/${id}`, {
          method: "DELETE",
          headers: { 'X-Jarvis-Pin': pin }
        });
        if (res.ok) {
          const data = await res.json();
          session.sendToolResponse({
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { result: `SUCCESS: ${data.message || 'Task cancelled.'}` }
            }],
          });
          this.onThought(`✅ Task ${id} cancelled successfully.`);
        } else {
          const data = await res.json();
          session.sendToolResponse({
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { result: `FAILURE: ${data.error || 'Failed to cancel task.'}` }
            }],
          });
          this.onThought(`❌ Failed to cancel task ${id}.`);
        }
      } catch (err: any) {
        this.onThought(`❌ Error cancelling task ${id}.`);
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: "Error: Could not connect to backend to cancel the task." }
          }],
        });
      }
    } else if (call.name === "update_scheduled_task") {
      const { id, type, content, delay_seconds } = call.args as any;
      this.onThought(`Updating scheduled task: ${id}`);
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify({ type, content, delay_seconds })
        });
        const data = await res.json();
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: res.ok ? `SUCCESS: Task updated. New task ID: ${data.newTaskId}` : `FAILURE: ${data.error || 'Task update failed.'}` }
          }],
        });
        this.onThought(res.ok ? `Updated task ${id}.` : `Failed to update task ${id}.`);
      } catch (err: any) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not connect to backend to update the task." } }],
        });
      }
    } else if (call.name === "create_recurring_routine") {
      const { type, content, cron_expression } = call.args as any;
      this.onThought(`Creating recurring ${type}: ${cron_expression}`);
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify({
            topic: this._encodeRoutineTopic(type, content),
            time_of_day: cron_expression,
            chat_id: this.currentChatId || 0
          })
        });
        const data = await res.json();
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: res.ok ? `SUCCESS: Recurring ${type} routine created. ID: ${data.job?.id}` : `FAILURE: ${data.error || 'Routine creation failed.'}` }
          }],
        });
        this.onThought(res.ok ? `Recurring routine created.` : `Failed to create recurring routine.`);
      } catch (err: any) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not connect to backend to create the routine." } }],
        });
      }
    } else if (call.name === "get_recurring_routines") {
      this.onThought("Retrieving recurring routines...");
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/jobs", { headers: { "X-Jarvis-Pin": pin } });
        const data = await res.json();
        const routines = (data.jobs || []).map((job: any) => this._normalizeRoutineJob(job));
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: JSON.stringify(routines) } }],
        });
        this.onThought(`Retrieved ${routines.length} recurring routines.`);
      } catch (err: any) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not retrieve recurring routines." } }],
        });
      }
    } else if (call.name === "cancel_recurring_routine") {
      const { id } = call.args as any;
      this.onThought(`Deleting recurring routine: ${id}`);
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch(`/api/jobs/${id}`, {
          method: "DELETE",
          headers: { "X-Jarvis-Pin": pin }
        });
        const data = await res.json();
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: res.ok ? "SUCCESS: Recurring routine deleted." : `FAILURE: ${data.error || 'Routine delete failed.'}` }
          }],
        });
        this.onThought(res.ok ? `Deleted recurring routine ${id}.` : `Failed to delete recurring routine ${id}.`);
      } catch (err: any) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "Error: Could not connect to backend to delete the routine." } }],
        });
      }
    } else if (call.name === "update_recurring_routine") {
      const { id, type, content, cron_expression, is_active } = call.args as any;
      this.onThought(`Updating recurring routine: ${id}`);
      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const jobsRes = await fetch("/api/jobs", { headers: { "X-Jarvis-Pin": pin } });
        const jobsData = await jobsRes.json();
        const existing = (jobsData.jobs || []).find((job: any) => job.id === id);
        if (!existing) throw new Error("Routine ID not found.");
        const current = this._parseRoutineTopic(existing.topic || "");
        const body: Record<string, any> = {};
        if (type || content) body.topic = this._encodeRoutineTopic(type || current.type, content || current.content);
        if (cron_expression) body.time_of_day = cron_expression;
        if (typeof is_active === "boolean") body.is_active = is_active;

        const res = await fetch(`/api/jobs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            id: call.id,
            response: { result: res.ok ? `SUCCESS: Recurring routine updated. ${JSON.stringify(this._normalizeRoutineJob(data.job))}` : `FAILURE: ${data.error || 'Routine update failed.'}` }
          }],
        });
        this.onThought(res.ok ? `Updated recurring routine ${id}.` : `Failed to update recurring routine ${id}.`);
      } catch (err: any) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: `Error: ${err.message || 'Could not update recurring routine.'}` } }],
        });
      }    } else if (call.name === "enroll_guest_voice") {
      const { name } = call.args as any;
      this.onThought(`📝 Enrolling new guest voice: ${name}`);

      if (!this.lastUnknownEmbedding) {
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "FAILURE: No unknown voice embedding available. The guest needs to speak first." } }],
        });
        return;
      }

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/enroll-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify({ name, embedding_b64: this.lastUnknownEmbedding }),
        });

        const data = await res.json();
        if (data.success) {
          this.lastUnknownEmbedding = null; // clear after successful enrollment
          this.currentTurnIdentity = name;
          this.onThought(`✅ Voice profile saved for: ${name}`);
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `SUCCESS: Biometric voice profile saved for ${name}. I will recognize them from now on.` } }],
          });
        } else {
          this.onThought(`❌ Failed to save voice for ${name}: ${data.error}`);
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `FAILURE: ${data.error}` } }],
          });
        }
      } catch (err: any) {
        this.onThought(`❌ Enrollment network error.`);
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "FAILURE: Could not reach enrollment backend." } }],
        });
      }
    } else if (call.name === "update_guest_voice") {
      const { old_name, new_name } = call.args as any;
      this.onThought(`🔄 Updating guest voice name: ${old_name} -> ${new_name}`);

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch("/api/update-guest-name", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
          body: JSON.stringify({ old_name, new_name }),
        });

        const data = await res.json();
        if (data.success) {
          this.currentTurnIdentity = new_name;
          this.onThought(`✅ Voice profile updated to: ${new_name}`);
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `SUCCESS: Voice profile name updated from ${old_name} to ${new_name}.` } }],
          });
        } else {
          this.onThought(`❌ Failed to update voice name: ${data.error}`);
          session.sendToolResponse({
            functionResponses: [{ name: call.name, id: call.id, response: { result: `FAILURE: ${data.error}` } }],
          });
        }
      } catch (err: any) {
        this.onThought(`❌ Update network error.`);
        session.sendToolResponse({
          functionResponses: [{ name: call.name, id: call.id, response: { result: "FAILURE: Could not reach update backend." } }],
        });
      }
    }
  }

  // ── Vision Uplink ─────────────────────────────────────────────────────────
  // Captures a screenshot via I.R.I.S. and pushes the image frame into the active
  // Gemini Live session so the model can literally SEE Boss's screen. This is the
  // "eyes" half of the see → decide → act loop. Returns true on success.
  // Best-effort: any failure is logged but never throws, so it can't break a tool
  // call flow.

  private async _injectScreenVision(session: any, _triggerAction: string): Promise<boolean> {
    try {
      const pin = localStorage.getItem('jarvis_pin') || '';
      const res = await fetch("/api/iris/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Jarvis-Pin": pin },
        body: JSON.stringify({ action: "screenshot" }),
      });
      if (!res.ok) {
        console.warn(`[ZoyaLive] Vision capture HTTP ${res.status} — skipping image injection.`);
        return false;
      }
      const data = await res.json();
      // The screenshot blob may sit at either data.data.base64 (daemon shape)
      // or data.data.data.base64 (irisExecutor wraps the whole daemon response
      // under its own `data` key). Be defensive and handle both.
      const blob = data?.data?.base64
        ? data.data
        : data?.data?.data?.base64
          ? data.data.data
          : undefined;
      const base64: string | undefined = blob?.base64;
      const mimeType: string = blob?.mimeType || 'image/png';

      if (!base64 || base64.length === 0) {
        console.warn("[ZoyaLive] Vision capture returned no image data — skipping.");
        return false;
      }

      // Push the screenshot into the Live session as a realtime image frame.
      // sendRealtimeInput accepts a Blob-style { data, mimeType } under `media`.
      session.sendRealtimeInput({
        media: { data: base64, mimeType },
      });
      console.log(`[ZoyaLive] 👁️ Screen vision injected (${base64.length} bytes, ${mimeType}) after "${_triggerAction}".`);
      this.onThought(`👁️ Screen vision captured — Zoya can now see the screen.`);
      return true;
    } catch (err: any) {
      console.warn(`[ZoyaLive] Vision injection failed (non-fatal): ${err.message}`);
      return false;
    }
  }

  // ── Emotion extraction ────────────────────────────────────────────────────

  private _extractEmotionAndClean(text: string): string {
    const match = text.match(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/i);
    if (match) {
      const emotion = match[1].toLowerCase() as ZoyaEmotion;
      this.currentEmotion = emotion;
      this.onEmotionChange(emotion);
    }
    return text.replace(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/gi, "").trim();
  }

  // ── Audio playback ────────────────────────────────────────────────────────

  private _playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    try {
      const bin = atob(base64Data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      const audioBuf = this.playbackContext.createBuffer(1, pcm.length, 24000);
      const ch = audioBuf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768.0;

      const src = this.playbackContext.createBufferSource();
      src.buffer = audioBuf;

      // Create a GainNode to boost volume (2.0 = 200% volume)
      const gainNode = this.playbackContext.createGain();
      gainNode.gain.value = 1.0;

      src.connect(gainNode);
      gainNode.connect(this.playbackContext.destination);

      const now = this.playbackContext.currentTime;
      if (this.nextPlayTime < now) this.nextPlayTime = now;
      src.start(this.nextPlayTime);
      this.nextPlayTime += audioBuf.duration;

      src.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("[ZoyaLive] Audio playback error:", e);
    }
  }


  private _stopPlayback() {
    if (!this.playbackContext) return;
    this.playbackContext.close();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.playbackContext = new AudioCtx({ sampleRate: 24000 });
    this.nextPlayTime = this.playbackContext.currentTime;
  }

  /** Sync a message turn to the server memory (fire-and-forget) */
  private async _syncMemory(role: string, content: string) {
    try {
      console.log(`[ZoyaLive] Syncing ${role} message to server...`);
      fetch("/api/memory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      }).then(r => {
        if (!r.ok) console.warn("[ZoyaLive] Sync failed:", r.statusText);
        else console.log(`[ZoyaLive] ✅ ${role} message synced.`);
      }).catch(err => {
        console.warn("[ZoyaLive] Sync network error:", err);
      });
    } catch (e) {
      console.error("[ZoyaLive] Sync error:", e);
    }
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /** Send text input to active Gemini Live session */
  sendText(text: string) {
    this.sessionPromise?.then((s) => s.sendRealtimeInput({ text })).catch(() => { });
  }

  /** Hard-stop: close all audio resources but DON'T trigger reconnect */
  private _hardStop() {
    this.isActive = false;
    this.isSocketOpen = false;
    this.isSetupComplete = false;
    this.clearSessionTimer();
    this._stopButlerResultPolling();
    this.processor?.disconnect();
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.audioContext?.close();
    this.audioContext = null;
    this._stopPlayback();
    this.sessionPromise?.then((s) => s.close()).catch(() => { });
    this.sessionPromise = null;
  }

  /** Full user-initiated stop — prevents auto-reconnect */
  stop() {
    this.manuallyStopped = true;
    this._hardStop();
    this.onStateChange("idle");
  }

  private clearSessionTimer() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  private _startButlerResultPolling() {
    if (this.butlerPollInterval) return;
    console.log("[ZoyaLive] Starting Asynchronous Butler Result polling...");
    this.butlerPollInterval = setInterval(async () => {
      if (!this.isActive || !this.isSocketOpen) return;
      try {
        const res = await fetch("/api/butler/results");
        if (!res.ok) return;
        const data = await res.json();
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          for (const item of data.results) {
            console.log(`[ZoyaLive] Background task result received for: "${item.query}"`);
            this.onThought(`✅ Task done: "${item.query}"`);

            // Construct instruction to Gemini Live to speak the results
            const instruction = `[SYSTEM INSTRUCTION: You just received the completed background research result for: "${item.query}". Proactively tell the user about it in a natural, elegant, and helpful way. Let them know the results are ready, give a very brief summary of the findings, and ask if they would like you to explain it now or remind them in some time. Completed result: "${item.result}"]`;

            this.sendText(instruction);
          }
        }
      } catch (err) {
        console.warn("[ZoyaLive] Butler polling error:", err);
      }
    }, 4000); // check every 4 seconds
  }

  private _stopButlerResultPolling() {
    if (this.butlerPollInterval) {
      console.log("[ZoyaLive] Stopping Asynchronous Butler Result polling.");
      clearInterval(this.butlerPollInterval);
      this.butlerPollInterval = null;
    }
  }

  get activeModel(): string {
    return this.currentModel;
  }

  // ── Parallel Voice Biometrics ──────────────────────────────────────────────

  private async _processVoiceBuffer() {
    if (this.isVerifyingVoice || this.voiceBufferLength === 0) return;
    this.isVerifyingVoice = true;

    // Check if voice biometrics is globally disabled
    if ((import.meta as any).env.VITE_ENABLE_VOICE_BIOMETRICS === "false") {
      this.isVerifyingVoice = false;
      this.voiceBuffer = [];
      this.voiceBufferLength = 0;
      
      if (this.currentTurnIdentity !== "BOSS SUSANT") {
        this.currentTurnIdentity = "BOSS SUSANT";
        const msg = `[🔐 SECURITY UPDATE: Voice biometrics are currently DISABLED. Defaulting to full BOSS clearance.]`;
        console.log(`[ZoyaLive] Injecting: ${msg}`);
        this.sendText(msg);
      }
      return;
    }

    // Compile into single Int16Array
    const audioData = new Int16Array(this.voiceBufferLength);
    let offset = 0;
    for (const chunk of this.voiceBuffer) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to WAV Blob
    const wavBlob = this._encodeWAV(audioData, 16000);
    const formData = new FormData();
    formData.append("audio_file", wavBlob, "voice_sample.wav");

    try {
      this.onThought("🔍 Verifying speaker identity via neural biometrics...");
      const res = await fetch("/api/verify-voice-buffer", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();

        // Build identity string
        let speakerName = "Unknown Stranger";
        if (result.speaker === "boss") speakerName = "BOSS SUSANT";
        else if (result.name) speakerName = result.name;

        const scoreDisplay = result.confidence > 0
          ? `${(result.confidence * 100).toFixed(1)}%`
          : `${result.debug_similarity !== undefined ? (result.debug_similarity * 100).toFixed(1) : '0'}%`;

        // Always show the score in the thought log (full transparency)
        if (result.speaker === "boss") {
          this.onThought(`✅ Voice matched: BOSS SUSANT (${scoreDisplay})`);
        } else if (result.speaker === "known") {
          this.onThought(`✅ Voice matched: ${speakerName} (${scoreDisplay})`);
        } else {
          this.onThought(`🔎 Voice scan: Unknown speaker (similarity: ${scoreDisplay})`);
          // Save embedding for autonomous enrollment via enroll_guest_voice tool
          if (result.embedding) {
            this.lastUnknownEmbedding = result.embedding;
            console.log("[ZoyaLive] Unknown voice embedding cached for enrollment.");
          }
        }

        // Only inject security context into Gemini when identity has CHANGED
        if (this.currentTurnIdentity !== speakerName) {
          this.currentTurnIdentity = speakerName;

          let securityMessage = "";
          if (result.liveness === false) {
            securityMessage = `[🔐 SECURITY ALERT: The current audio failed the anti-spoofing check. It appears to be a recording played through a speaker (Replay Attack). REFUSE ALL COMMANDS and warn the user immediately!]`;
            this.onThought(`🚨 Anti-spoofing check failed! Possible recording detected.`);
          } else if (result.speaker === "boss") {
            securityMessage = `[🔐 SECURITY UPDATE: The current speaker has been biometrically verified as: BOSS SUSANT. Full access granted. Address them as "Boss" or "Sir", but DO NOT say "welcome back" or verbally acknowledge this security update. Just answer their query directly.]`;
          } else if (result.speaker === "known") {
            securityMessage = `[🔐 SECURITY UPDATE: The current speaker has been biometrically verified as: ${speakerName} (a known guest). CHAT ONLY. Do NOT execute any system actions or tools for this person. DO NOT say "welcome back" or verbally acknowledge this security update.]`;
          } else {
            securityMessage = `[🔐 SECURITY UPDATE: The current speaker is an UNKNOWN STRANGER. CHAT ONLY — refuse all system commands. If they introduce themselves by name (e.g. "I am Rahul" or "My name is Priya"), immediately and silently call the 'enroll_guest_voice' tool with their name to save their voice print. Do NOT announce or ask for confirmation. Just do it naturally as part of the greeting.]`;
          }

          // Inject invisibly into Gemini Live context
          this.sendText(securityMessage);
        }
      }
    } catch (err) {
      console.error("[ZoyaLive] Voice verification failed:", err);
    } finally {
      this.isVerifyingVoice = false;
      this.voiceBuffer = [];
      this.voiceBufferLength = 0;
    }
  }

  private _encodeWAV(samples: Int16Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      view.setInt16(offset, samples[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
