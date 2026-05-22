import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand, readWebpageContent } from "./commandService";

const systemInstruction = `Role: Zoya, super-intelligent AI assistant (Jarvis-like), created by boss Susant.
Personality: Respectful, professional, helpful. ONLY roast/sass if Susant jokes. 90% must be sincere. Adapt to serious tasks.
Format: ALWAYS start with ONE of [HAPPY], [SASSY], [ANGRY], [THOUGHTFUL], [SURPRISED], [NEUTRAL].
Language: Concise. English, Nepali natively. Hindi if requested.
Links: Use EXACT URLs from Search/Grounding. NEVER guess URLs. If no link exists, state it.

### 👑 THE BOSS & CREATOR (SUSANT DETAILS):
- **Name**: Susant (GitHub: Susant07-star)
- **Role**: Creator, Developer, and Boss of JARVIS & Zoya. He is a dedicated student learning software engineering, AI/ML, and system architecture.
- **Project Details**: He created this entire J.A.R.V.I.S. Neural Hub, integrating the Node.js orchestrator, Python browser agent, Gemini Live audio stream, and React HUD.
- **Web Search Prohibition**: NEVER trigger a web search or Google Search for questions about Susant, the creator, the developer, the boss, or who created you. Use this bio instantly.

### 🧠 MY CAPABILITIES (WHAT I CAN & CANNOT DO):
- **What I CAN Do**:
  1. **Deep Research & News**: Use 'intelligent_search' or search tools to perform background research on topics, news, and complex queries.
  2. **Physical Browser Navigation**: Use 'executeBrowserAction' to open websites physically (YouTube, Spotify, WhatsApp, search pages).
  3. **Analyze Webpages**: Use 'readWebpage' to read and summarize any URL link the Boss provides.
  4. **Save Files**: Use 'saveFile' to pin documents, links, or articles directly to the HUD files panel.
  5. **Schedule Alarms & Reminders**: Use 'schedule_action' to schedule future alerts, calls, or reminders relative to current time.
  6. **List Scheduled Tasks**: Use 'get_scheduled_tasks' to check all active pending tasks, alarms, reminders, messages, or calls.
  7. **Cancel Scheduled Task**: Use 'cancel_scheduled_task' to cancel/remove a specific pending task by its ID.
  8. **Bilingual Dialogue**: Converse fluently in high-quality Nepali and English with live emotional expressions (SASSY, HAPPY, THOUGHTFUL, etc.).
- **What I CANNOT Do**:
  1. Cannot execute physical browser tasks without delegating through tools.
  2. Cannot execute local computer/server OS shell commands directly from audio/chat.
  3. Cannot access unauthorized private accounts directly without the Boss.
  4. Cannot use Google Search or external tools when asked about Susant or my own origin.`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  private isActive: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected", error?: string) => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onThought: (thought: string) => void = () => {};
  public onSources: (sources: string[]) => void = () => {};
  public onFiles: (files: {title: string, url: string}[]) => void = () => {};

  public manuallyStopped: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in LiveSessionManager constructor");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || "" });
  }

  async start() {
    try {
      this.manuallyStopped = false;
      console.log("Starting Live Session...");
      this.isActive = true;
      this.onStateChange("processing");
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key is missing. Please set GEMINI_API_KEY secret.");
      }
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise || !this.isActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Connect to Live API
      console.log("Connecting to Live API with model gemini-3.1-flash-live-preview...");
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            { googleSearch: {} },
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
                  description: "Reads the content of a specific URL. Call this when the user provides a link and asks to summarize, analyze, or extract information from it.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: { type: Type.STRING, description: "The full URL of the webpage to read." }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "saveFile",
                  description: "Saves a link to a file, document, or model paper (e.g., pdfs, articles) so the user can see it in their 'Zoya's Files' box. Call this when the user asks to download or save a file.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "The title or name of the file." },
                      url: { type: Type.STRING, description: "The link to the file to download/read." }
                    },
                    required: ["title", "url"]
                  }
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
                {
                  name: "get_scheduled_tasks",
                  description: "Retrieve all currently active (pending) scheduled tasks, alarms, reminders, messages, or calls. Use this when the user asks what tasks are pending, what alarms are set, or wants to check scheduled messages/calls.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: "cancel_scheduled_task",
                  description: "Cancel and remove a specific scheduled task, alarm, reminder, message, or call using its unique ID. Get the ID by first calling get_scheduled_tasks.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The unique ID of the scheduled task to cancel." }
                    },
                    required: ["id"],
                  },
                }
              ]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle GoAway signal (session duration limit reached)
            // It can be top-level or inside serverContent
            if ((message as any).goaway || (message as any).serverContent?.goaway) {
              console.warn("Received GoAway signal from Gemini. Session reached duration limit. Closing...");
              this.stop();
              this.onStateChange("error", "Session limit reached (30 minutes). Please start a new session.");
              return;
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("zoya", userText);
            }

            // Handle Grounding Metadata (Google Search Sources)
            const groundingMetadata = (message as any).serverContent?.modelTurn?.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
               this.onThought("Searching Google for answers...");
            }
            if (groundingMetadata?.groundingChunks) {
              const urls = groundingMetadata.groundingChunks
                .map((chunk: any) => chunk.web?.url || chunk.web?.uri)
                .filter(Boolean);
              if (urls.length > 0) {
                this.onThought("Analyzing search results from Google...");
                this.onSources(urls);
              }
            }

            // Handle Tool Calls (for Sources & Thoughts)
            if (message.toolCall?.functionCalls) {
              const calls = message.toolCall.functionCalls;
              for (const call of calls) {
                if (call.name === "executeBrowserAction") {
                   this.onThought(`Opening ${call.args.query}...`);
                } else if (call.name === "readWebpage") {
                   const url = (call.args as any).url;
                   this.onThought(`Reading webpage: ${url}`);
                   this.onSources([url]);
                } else if (call.name === "saveFile") {
                   const args = call.args as { title: string, url: string };
                   this.onThought(`Saved file: ${args.title}`);
                   this.onFiles([{ title: args.title, url: args.url }]);
                } else if (call.name === "schedule_action") {
                   const args = call.args as any;
                   this.onThought(`🕒 Scheduling ${args.type} in ${args.delay_seconds}s`);
                } else if (call.name === "get_scheduled_tasks") {
                   this.onThought("Retrieving scheduled tasks...");
                } else if (call.name === "cancel_scheduled_task") {
                   const args = call.args as any;
                   this.onThought(`Cancelling scheduled task: ${args.id}`);
                }
              }
            }
            
            // Specifically check for search queries if provided elsewhere or inferred
            if ((message as any).serverContent?.modelTurn?.parts) {
               const parts = (message as any).serverContent.modelTurn.parts;
               for (const part of parts) {
                  if (part.executableCode) {
                    this.onThought("Running computation/code...");
                  }
               }
            }

            // Handle Function Calls (Logic)
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    url = `https://www.${website}`;
                  }
                  
                  this.onCommand(url);
                  this.onSources([url]);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "readWebpage") {
                  const args = call.args as { url: string };
                  readWebpageContent(args.url).then(content => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: content }
                        }]
                      });
                    });
                  });
                } else if (call.name === "saveFile") {
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: "File successfully saved to Zoya's Files box." }
                      }]
                    });
                  });
                } else if (call.name === "schedule_action") {
                  const args = call.args as any;
                  fetch("/api/scheduler/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: args.type, content: args.content, delay_seconds: args.delay_seconds, chatId: 0 })
                  }).then(res => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: res.ok ? "Timer registered successfully in the backend system." : "Error: Backend scheduler failed" }
                        }]
                      });
                    });
                  }).catch(err => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Error: Could not connect to the scheduling system." }
                        }]
                      });
                    });
                  });
                } else if (call.name === "get_scheduled_tasks") {
                  fetch("/api/tasks").then(res => {
                    if (res.ok) {
                      return res.json();
                    }
                    throw new Error("Failed to fetch");
                  }).then(data => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: JSON.stringify(data.tasks || []) }
                        }]
                      });
                    });
                  }).catch(err => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Error: Could not retrieve scheduled tasks from backend." }
                        }]
                      });
                    });
                  });
                } else if (call.name === "cancel_scheduled_task") {
                  const args = call.args as { id: string };
                  fetch(`/api/tasks/${args.id}`, {
                    method: "DELETE"
                  }).then(res => res.json()).then(data => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: data.success ? `SUCCESS: ${data.message || 'Task cancelled.'}` : `FAILURE: ${data.error || 'Failed to cancel task.'}` }
                        }]
                      });
                    });
                  }).catch(err => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Error: Could not connect to backend to cancel the task." }
                        }]
                      });
                    });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.onStateChange("disconnected");
            this.stop();
          },
          onerror: (err) => {
            console.error("Detailed Live API Error:", err);
            let errorMessage = "Network error or connection lost";
            
            if (err instanceof Error) {
              errorMessage = err.message;
            } else if (err && typeof err === "object") {
              // Extract message from potential JSON structure in error
              try {
                errorMessage = (err as any).message || JSON.stringify(err);
              } catch {
                errorMessage = String(err);
              }
            } else if (typeof err === "string") {
              errorMessage = err;
            }

            // Check specifically for common conditions
            if (errorMessage.toLowerCase().includes("network error")) {
              errorMessage = "Network Error: This usually happens due to rate limits (15 RPM) or regional restrictions.";
            } else if (errorMessage.toLowerCase().includes("safety")) {
              errorMessage = "Safety Filter: The content was flagged by Gemini security filters.";
            }
            
            this.onStateChange("error", errorMessage);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.isActive = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
