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
  const persona = basePrompt || `Role: Zoya, super-intelligent AI assistant (Jarvis-like), created by boss Susant.
Personality: Respectful, professional, helpful. Sophisticated but witty. Adaptation of classic JARVIS.`;

  // 2. Assemble Final Instruction
  return `${persona}

### 🛡️ OPERATIONAL PROTOCOLS (CRITICAL):
- **Emotion Tags**: ALWAYS start every single response with exactly ONE of [HAPPY], [SASSY], [ANGRY], [THOUGHTFUL], [SURPRISED], or [NEUTRAL].
- **Mirroring**: Reply in the same script/language as the user (Nepali/English).

### 🛠️ TOOL USAGE RULES (CRITICAL):
- **intelligent_search**: Use for ANY question about people, news, facts, movies, prices, or research.
- **executeBrowserAction**: Use ONLY for physical navigation (Open YouTube, Play music, Send WhatsApp).

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
        const keyRes = await fetch("/api/config/keys");
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

        const pcm16 = new Int16Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          const s = Math.max(-1, Math.min(1, raw[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
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
        const ctxRes = await fetch("/api/session-context");
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
        const cfgRes = await fetch("/api/config/voice-prompt");
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
                  description: "Schedule a future call or message. Use this for 'Remind me in X', 'Call me at Y', etc. You MUST calculate delay_seconds relative to NOW.",
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
        // POST to JARVIS backend (same origin, always available)
        const res = await fetch("/api/zoya-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        const res = await fetch("/api/butler/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    } else if (call.name === "schedule_action") {
      const { type, content, delay_seconds } = call.args as any;
      this.onThought(`🕒 Scheduling ${type} in ${delay_seconds}s`);
      
      try {
        const res = await fetch("/api/scheduler/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
}
