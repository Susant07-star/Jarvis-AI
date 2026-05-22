import { GoogleGenAI, Type } from "@google/genai";
import { readWebpageContent } from "./commandService";

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
  6. **Bilingual Dialogue**: Converse fluently in high-quality Nepali and English with live emotional expressions (SASSY, HAPPY, THOUGHTFUL, etc.).
- **What I CANNOT Do**:
  1. Cannot execute physical browser tasks without delegating through tools.
  2. Cannot execute local computer/server OS shell commands directly from audio/chat.
  3. Cannot access unauthorized private accounts directly without the Boss.
  4. Cannot use Google Search or external tools when asked about Susant or my own origin.`;

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(
  prompt: string, 
  history: { sender: "user" | "zoya", text: string }[] = [],
  onThought?: (thought: string) => void,
  onSources?: (sources: string[]) => void,
  onFiles?: (files: {title: string, url: string}[]) => void
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      // ... (rest of session init)
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "readWebpage",
                  description: "Reads the content of a specific URL. Call this when the user provides a link.",
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
                }
              ]
            }
          ]
        },
        history: formattedHistory,
      });
    }

    let response = await chatSession.sendMessage({ message: prompt });
    
    // Check for Google Search grounding in text mode
    const metadata = response.candidates?.[0]?.groundingMetadata;
    if (metadata) {
      if (metadata.searchEntryPoint) onThought?.("Searching Google for answers...");
      if (metadata.groundingChunks) {
        const urls = metadata.groundingChunks.map((c: any) => c.web?.url || c.web?.uri).filter(Boolean);
        if (urls.length > 0) onSources?.(urls);
      }
    }

    // Handle Function Call for Chat mode
    const call = response.functionCalls?.[0];
    if (call && call.name === "readWebpage") {
      onThought?.(`Reading webpage: ${(call.args as any).url}`);
      onSources?.([(call.args as any).url]);
      const content = await readWebpageContent((call.args as any).url);
      response = await chatSession.sendMessage({
        functionResponses: [{
          name: call.name,
          id: call.id,
          response: { result: content }
        }]
      });
    } else if (call && call.name === "saveFile") {
      const args = call.args as any;
      onThought?.(`Saved file: ${args.title}`);
      onFiles?.([{ title: args.title, url: args.url }]);
      response = await chatSession.sendMessage({
        functionResponses: [{
          name: call.name,
          id: call.id,
          response: { result: "File successfully saved to Zoya's Files box. You can notify the user now." }
        }]
      });
    }

    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, my brain has short-circuited. Try again later, Susant.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
       console.error("GEMINI_API_KEY is missing in getZoyaAudio");
       return null;
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

