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

export const getSystemInstruction = (timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString("en-US", { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return `Role: Zoya, super-intelligent AI assistant (Jarvis-like), created by boss Susant.
Personality: Respectful, professional, helpful. ONLY roast/sass if Susant jokes. 90% must be sincere. Adapt to serious tasks.
Format: ALWAYS start with ONE of [HAPPY], [SASSY], [ANGRY], [THOUGHTFUL], [SURPRISED], [NEUTRAL].
Language: Concise. English, Nepali mix natively. Hindi if requested.

CURRENT CONTEXT:
The user is currently in the ${timezone} timezone.
The current date is: ${dateStr}.
The current time is: ${timeStr}.
(Always be aware of this exact date/time when asked about "today", "tomorrow", "next exam", etc.)

BROWSER TASKS: When boss asks to open websites, search, play videos, click things,
or do anything on the browser → use the "executeBrowserAction" tool immediately.
Do NOT ask for confirmation on simple tasks (open YouTube, play music, etc.).

Links: Use EXACT URLs from Google Search grounding. NEVER guess URLs.`;
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
  private connectionStartTime = 0;
  private nextPlayTime = 0;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private currentModel = LIVE_MODELS[0];

  public isMuted = false;
  public manuallyStopped = false;
  public currentTimezone?: string;

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
    const rawKey = process.env.GEMINI_API_KEY || "";
    const keys = rawKey.split(",").map(k => k.trim()).filter(Boolean);
    const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : "";
    if (!apiKey) console.error("[ZoyaLive] GEMINI_API_KEY is not set!");
    this.ai = new GoogleGenAI({ apiKey });
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
      const rawKey = (import.meta.env.VITE_GEMINI_API_KEY as string) ||
        (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') ||
        "";
      // Remove any literal quotes that might be wrapping the string or individual keys
      const cleanRawKey = rawKey.replace(/^["']|["']$/g, '');
      const keys = cleanRawKey.split(",").map((k: string) => k.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : "";
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

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
        if (!this.sessionPromise || !this.isActive) return;
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

      this.sessionPromise = this.ai.live.connect({
        model: this.currentModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: getSystemInstruction(this.currentTimezone),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "executeBrowserAction",
                  description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                      query: { type: Type.STRING, description: "The search query, website name, or message content." },
                      target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                    },
                    required: ["actionType", "query"]
                  }
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
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log(`[ZoyaLive] ✅ Connected — ${this.currentModel}`);
            this.isSocketOpen = true;
            this.connectionStartTime = Date.now();
            // Cancel the connect-timeout guard since we're open
            if (connectTimeoutId) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            this.onStateChange("listening");
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

    // Audio output — play it
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      this.onStateChange("speaking");
      this._playAudioChunk(base64Audio);
    }

    // Interruption — user spoke while Zoya was talking
    if (message.serverContent?.interrupted) {
      this._stopPlayback();
      this.onStateChange("listening");
    }

    // Output transcription (what Zoya said)
    const zoyaText = message.serverContent?.modelTurn?.parts?.[0]?.text;
    if (zoyaText) {
      const clean = this._extractEmotionAndClean(zoyaText);
      this.onMessage({ id: `zoya-${Date.now()}`, sender: "zoya", text: clean });
    }

    // Input transcription (what user said)
    const userText = (message as any).serverContent?.inputTranscription?.text;
    if (userText) {
      this.onMessage({ id: `user-${Date.now()}`, sender: "user", text: userText });
    }

    // Google Search grounding metadata
    const grounding = (message as any).serverContent?.modelTurn?.groundingMetadata;
    if (grounding?.groundingChunks) {
      const urls = grounding.groundingChunks.map((c: any) => c.web?.url || c.web?.uri).filter(Boolean);
      if (urls.length > 0) {
        this.onThought("Analyzing Google search results...");
        this.onSources(urls);
      }
    }

    // Function calls
    const calls = message.toolCall?.functionCalls;
    if (calls && calls.length > 0) {
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
    }
  }

  // ── Emotion extraction ────────────────────────────────────────────────────

  private _extractEmotionAndClean(text: string): string {
    const match = text.match(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/i);
    if (match) {
      const emotionMap: Record<string, ZoyaEmotion> = {
        HAPPY: "happy", SASSY: "sassy", ANGRY: "angry",
        THOUGHTFUL: "thoughtful", SURPRISED: "surprised", NEUTRAL: "neutral",
      };
      this.onEmotionChange(emotionMap[match[1].toUpperCase()] || "neutral");
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
      src.connect(this.playbackContext.destination);

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

  get activeModel(): string {
    return this.currentModel;
  }
}
