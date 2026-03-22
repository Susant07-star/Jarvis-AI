import Groq from "groq-sdk";
import { MemoryMessage } from "./memory";

/**
 * Summarizes older conversation history to save tokens.
 * Keeps recent messages intact based on the agent type (Browser needs more context).
 */
export async function summarizeMemory(memory: MemoryMessage[], groq: Groq, agentType: "voice" | "browser" | "vision" = "browser"): Promise<MemoryMessage[]> {
  console.log(`[LLM] Summarizing memory (current length: ${memory.length}, agent: ${agentType})`);
  
  // Dynamic buffer size:
  // Browser/Vision agents need more history for multi-step tasks (DOM lists, coordinates)
  // Voice agent only needs recent conversational context
  const keepCount = agentType === "voice" ? 2 : 6;
  const triggerLength = keepCount + 2;
  
  if (memory.length <= triggerLength) {
    return memory.map((m) => ({
      role: m.role === 'jarvis' ? 'assistant' : 'user',
      content: m.content
    }));
  }
  
  const toSummarize = memory.slice(0, memory.length - keepCount);
  const toKeep = memory.slice(memory.length - keepCount);
  
  const textToSummarize = toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n');
  
  try {
    const summaryResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { 
          role: "system", 
          content: "Summarize the following conversation context concisely. CRITICAL INSTRUCTIONS: You MUST retain any active DOM element lists, ongoing search results, active website states, or user preferences. If the user is in the middle of a multi-step task (like selecting a video from a list), ENSURE the list options are preserved in the summary." 
        },
        { role: "user", content: textToSummarize }
      ],
      max_tokens: 200
    });
    
    const newSummary = summaryResponse.choices[0]?.message?.content || "";
    console.log(`[LLM] Memory summarized successfully (${newSummary.length} chars).`);
    
    return [
      { role: "system", content: `Previous conversation summary: ${newSummary}` },
      ...toKeep.map((m) => ({
        role: m.role === 'jarvis' ? 'assistant' : 'user',
        content: m.content
      }))
    ];
  } catch (e) {
    console.error("[LLM Summarization Error]", e);
    return memory.map((m) => ({
      role: m.role === 'jarvis' ? 'assistant' : 'user',
      content: m.content
    }));
  }
}

/**
 * Retrieves a configured Groq client using API key rotation.
 */
export function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured. Please add it to your secrets.");
  }
  
  const apiKeys = process.env.GROQ_API_KEY.split(',').map(k => k.trim());
  const selectedApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
  
  return new Groq({ apiKey: selectedApiKey });
}

/**
 * Logs token usage to a historical CSV file for performance monitoring.
 */
export function logTokenUsage(agentName: string, promptTokens: number, completionTokens: number) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // e.g. "2026-03"
    const logFile = path.join(logsDir, `token_usage_${monthStr}.csv`);
    
    const total = promptTokens + completionTokens;
    
    // Create header if new file
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "Timestamp,Agent,PromptTokens,CompletionTokens,TotalTokens\n");
    }
    
    // Append the log
    fs.appendFileSync(logFile, `${now.toISOString()},${agentName},${promptTokens},${completionTokens},${total}\n`);
  } catch (err) {
    console.error(`[TokenLogger] Failed to write token metrics:`, err);
  }
}
