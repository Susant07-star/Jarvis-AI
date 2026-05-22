import fs from "fs";
import path from "path";

const SESSION_FILE = path.join(process.cwd(), 'session_memory.json');

export interface MemoryMessage {
  role: string;
  content: string;
  timestamp?: string;
}

/**
 * Saves a message to the session memory file.
 * NOTE ON MULTI-AGENT SCALING:
 *  - fs.readFileSync and writeFileSync are fully synchronous in Node.
 *  - This inherently prevents race conditions even if Voice, Vision, and Browser 
 *    agents hit saveToMemory simultaneously on the main thread.
 */
export function saveToMemory(role: string, content: string) {
  try {
    let memory: MemoryMessage[] = [];
    if (fs.existsSync(SESSION_FILE)) {
      const fileContent = fs.readFileSync(SESSION_FILE, 'utf-8');
      if (fileContent.trim()) {
        try {
          memory = JSON.parse(fileContent);
        } catch (parseError) {
          console.warn("[Memory] Corrupted session memory file, resetting to empty array.");
          memory = [];
        }
      }
    }
    
    memory.push({ role, content, timestamp: new Date().toISOString() });
    
    // --- MULTI-AGENT LIMITS EXPLAINED ---
    // We cap the file at 50 to prevent infinite disk growth over months of usage.
    // 50 messages IS NOT what is sent to the LLM!
    // llm.ts uses `summarizeMemory()` to compress these 50 messages down to ~6 
    // before making the Groq API call, guaranteeing token limits are never exceeded.
    if (memory.length > 50) memory = memory.slice(-50);
    
    fs.writeFileSync(SESSION_FILE, JSON.stringify(memory, null, 2));
    console.log(`[Memory] Saved message from ${role} (${content.length} chars)`);
  } catch (e) {
    console.error("[Memory] Failed to save memory:", e);
  }
}

/**
 * Loads the current session memory.
 */
export function loadMemory(): MemoryMessage[] {
  let memory: MemoryMessage[] = [];
  if (fs.existsSync(SESSION_FILE)) {
    const fileContent = fs.readFileSync(SESSION_FILE, 'utf-8');
    if (fileContent.trim()) {
      try {
        memory = JSON.parse(fileContent);
      } catch (e) {
        console.warn("[Memory] Corrupted session memory file, resetting to empty array.");
        memory = [];
      }
    }
  }
  return memory;
}

/**
 * Returns a compact context block from the last N messages.
 * Used to inject shared chat history into Zoya's systemInstruction at session start.
 * Uses up to 50 turns × 500 chars ≈ ~6,000 tokens — well within Gemini's 32K window.
 */
export function getSessionContextSummary(maxTurns: number = 50): string {
  const memory = loadMemory();
  if (memory.length === 0) return "";

  const recent = memory.slice(-maxTurns);
  const lines = recent.map(m => {
    const speaker = m.role === "user" ? "Boss" : "JARVIS";
    // Allow up to 500 chars per message — better context fidelity within 32K window
    const text = m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content;
    return `${speaker}: ${text}`;
  });

  return `\n\nRECENT CONVERSATION (shared across voice and chat):\n${lines.join("\n")}`;
}

/**
 * Returns statistics about the current memory usage.
 */
export function getMemoryStats() {
  const memory = loadMemory();
  const charCount = memory.reduce((sum, msg) => sum + msg.content.length, 0);
  return {
    messageCount: memory.length,
    charCount,
    estimatedTokens: Math.ceil(charCount / 4), // Rough estimate: 4 chars per token
    maxMessages: 50
  };
}
