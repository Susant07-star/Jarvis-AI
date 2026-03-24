import fs from "fs";
import path from "path";
import Groq from "groq-sdk";
import { MemoryMessage } from "./memory";
import { logger } from "./logger";

/**
 * Summarizes older conversation history to save tokens.
 */
export async function summarizeMemory(memory: MemoryMessage[], groq: Groq, agentType: "voice" | "browser" | "vision" = "browser"): Promise<MemoryMessage[]> {
  logger.info('LLM', `Summarizing memory (length: ${memory.length}, agent: ${agentType})`);

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
    logger.info('LLM', `Memory summarized (${newSummary.length} chars)`);

    return [
      { role: "system", content: `Previous conversation summary: ${newSummary}` },
      ...toKeep.map((m) => ({
        role: m.role === 'jarvis' ? 'assistant' : 'user',
        content: m.content
      }))
    ];
  } catch (e) {
    logger.error('LLM', 'Summarization failed', e);
    return memory.map((m) => ({
      role: m.role === 'jarvis' ? 'assistant' : 'user',
      content: m.content
    }));
  }
}

// ===== API Key Rotation with 429 Recovery =====

interface KeySlot {
  key: string;
  blockedUntil: number;
}

let keyPool: KeySlot[] = [];
let currentKeyIndex = 0;

function initKeyPool() {
  if (keyPool.length > 0) return;
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }
  keyPool = process.env.GROQ_API_KEY.split(',').map(k => ({
    key: k.trim(),
    blockedUntil: 0
  }));
  logger.info('LLM', `Key pool initialized with ${keyPool.length} key(s)`);
}

function getNextAvailableKey(): string {
  initKeyPool();
  const now = Date.now();
  for (let i = 0; i < keyPool.length; i++) {
    const idx = (currentKeyIndex + i) % keyPool.length;
    if (keyPool[idx].blockedUntil <= now) {
      currentKeyIndex = (idx + 1) % keyPool.length;
      return keyPool[idx].key;
    }
  }
  // All keys blocked — use the one that unblocks soonest
  const soonest = keyPool.reduce((a, b) => a.blockedUntil < b.blockedUntil ? a : b);
  logger.warn('LLM', `All keys rate-limited. Using least-blocked key.`);
  return soonest.key;
}

function blacklistCurrentKey(apiKey: string, durationMs = 60000) {
  const slot = keyPool.find(k => k.key === apiKey);
  if (slot) {
    slot.blockedUntil = Date.now() + durationMs;
    logger.warn('LLM', `Key ...${apiKey.slice(-6)} blacklisted for ${durationMs / 1000}s`);
  }
}

/**
 * Retrieves a Groq client using round-robin key rotation.
 */
export function getGroqClient(): Groq {
  const apiKey = getNextAvailableKey();
  return new Groq({ apiKey });
}

/**
 * Wraps an async function that uses Groq. On 429, blacklists the key and retries with next.
 */
export async function callWithRetry<T>(fn: (groq: Groq) => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apiKey = getNextAvailableKey();
    const groq = new Groq({ apiKey });
    try {
      return await fn(groq);
    } catch (err: any) {
      const status = err?.status || err?.error?.status;
      if (status === 429) {
        blacklistCurrentKey(apiKey);
        logger.warn('LLM', `429 rate limit hit (attempt ${attempt + 1}/${maxRetries}). Rotating key...`);
        continue;
      }
      throw err; // Non-429 errors propagate immediately
    }
  }
  throw new Error('All API keys exhausted after retries.');
}

/**
 * Logs token usage to a historical CSV file.
 */
export function logTokenUsage(agentName: string, promptTokens: number, completionTokens: number) {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7);
    const logFile = path.join(logsDir, `token_usage_${monthStr}.csv`);
    const total = promptTokens + completionTokens;

    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "Timestamp,Agent,PromptTokens,CompletionTokens,TotalTokens\n");
    }

    fs.appendFileSync(logFile, `${now.toISOString()},${agentName},${promptTokens},${completionTokens},${total}\n`);
    logger.info('TokenLogger', `${agentName}: ${total} tokens`);
  } catch (err) {
    logger.error('TokenLogger', 'Failed to write token metrics', err);
  }
}

/**
 * Logs positive/negative UI feedback.
 */
export function logFeedback(messageId: string, query: string, response: string, isPositive: boolean, comment: string) {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const logFile = path.join(logsDir, `feedback_reports.csv`);
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "Timestamp,MessageId,Rating,UserQuery,JarvisResponse,UserComment\n");
    }

    const now = new Date().toISOString();
    const safeQuery = `"${query.replace(/"/g, '""')}"`;
    const safeResponse = `"${response.replace(/"/g, '""')}"`;
    const safeComment = `"${comment.replace(/"/g, '""')}"`;
    const rating = isPositive ? "Positive" : "Negative";

    fs.appendFileSync(logFile, `${now},${messageId},${rating},${safeQuery},${safeResponse},${safeComment}\n`);
  } catch (err) {
    logger.error('FeedbackLogger', 'Failed to write feedback', err);
  }
}
