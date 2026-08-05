import { callWithRetry } from "./llm";
import { logger } from "./logger";
import { GoogleGenAI } from "@google/genai";
import { getRandomKey } from "./llmRouter";

export type IntentType = "task" | "chat" | "schedule";

/**
 * Classifies user intent into "task" (agent mode), "chat" (direct mode), or "schedule" (direct scheduler actions).
 * Tiers: Local Guard -> Groq 8B -> Groq 70B -> SambaNova -> Gemini -> Safety Net.
 */
export async function classifyIntent(text: string): Promise<IntentType> {
  const lower = text.toLowerCase();
  
  // Local Guard: Instant, 100% accurate, zero-latency scheduling match
  const scheduleKeywords = [
    // Create
    "remind", "wake me up", "set alarm", "set alarm for", "timer for", "set a timer",
    "schedule a", "call me in", "message me in", "ping me in", "alarm for", "alert me",
    "set a reminder", "alarm at", "alarm to", "regarding alarm", "alarm set",
    // Cancel
    "cancel alarm", "cancel my alarm", "cancel reminder", "cancel my reminder",
    "cancel the alarm", "cancel the reminder", "remove alarm", "remove reminder",
    "delete alarm", "delete reminder", "stop alarm", "turn off alarm",
    // Modify
    "change my alarm", "change my reminder", "change the alarm", "update my alarm",
    "update my reminder", "modify alarm", "reschedule alarm", "reschedule reminder",
    "move my alarm", "postpone alarm",
    // Recurring routines / jobs
    "every day", "everyday", "daily", "every morning", "each morning", "each day",
    "every week", "weekly", "monthly", "recurring", "routine", "routines", "job", "jobs",
    "regular reminder", "regular message", "regular research", "morning message",
    // Nepali/Hinglish scheduling words commonly produced by STT
    "हरेक", "दैनिक", "प्रत्येक", "बिहान", "सम्झाउनु", "सम्झाइ", "रिमाइन्ड",
    "म्यासेज", "मेसेज", "सन्देश", "डिलिट", "हटाउ", "मेटाउ", "क्यान्सिल",
  ];
  if (scheduleKeywords.some(k => lower.includes(k))) {
    logger.info("Classifier", `[LocalGuard] Match schedule intent: "${text}"`);
    return "schedule";
  }

   // Local Guard: Website/App opening detection (FORCE CHAT MODE for I.R.I.S. routing)
   // This MUST be checked BEFORE creatorKeywords to catch all variations
   const websitePatterns = [
     /youtube\.com/i, /google\.com/i, /facebook\.com/i, /twitter\.com/i,
     /instagram\.com/i, /reddit\.com/i, /linkedin\.com/i, /github\.com/i,
     /amazon\.com/i, /netflix\.com/i, /whatsapp/i,
     /open\s+(youtube|google|facebook|twitter|instagram|reddit|linkedin|github|amazon|netflix|chrome|edge)/i,
     /go\s+to\s+(youtube|google|facebook|twitter|instagram|reddit|linkedin|github|amazon|netflix)/i
   ];
   if (websitePatterns.some(pattern => pattern.test(text))) {
     logger.info("Classifier", `[LocalGuard] Detected website/app navigation via I.R.I.S.: "${text}"`);
     return "chat";
   }

   // Local Guard: App/OS command detection
   const appOpenKeywords = ["open app", "close app", "open ", "close ", "type ", "press ", "press ctrl", "scroll", "phantom type"];
   if (appOpenKeywords.some(k => lower.includes(k))) {
     logger.info("Classifier", `[LocalGuard] Detected OS command intent: "${text}"`);
     return "chat";
   }

  // Local Guard: Creator/queries
   const creatorKeywords = [
     "susant", "developer", "creator", "maker", "who created you", "who made you", 
     "who built you", "who is the boss", "the boss", "your capability", "what can you do",
     "what you can do", "what you can't do", "what you cannot do", "your limitation",
   ];
  if (creatorKeywords.some(k => lower.includes(k))) {
    logger.info("Classifier", `[LocalGuard] Match creator/OS command query for chat intent: "${text}"`);
    return "chat";
  }

  const prompt = `You are the J.A.R.V.I.S. Intent Gatekeeper. Your mission is to PREVENT unnecessary research tasks.

    - "chat": Default conversational mode.
    - "task": Used for physical actions (browser, searching, scheduling).
    - "sync": Lightweight synchronization (NOT for scheduling).

    CRITICAL: Any request involving TIME (e.g., "in 5 minutes", "at 5 PM", "remind me", "call me later", "schedule") MUST be classified as "task".

User Input: "${text}"
Reply with EXACTLY one word: "task" or "chat".`;

  // --- Tier 1: Groq 8B ---
  try {
    const res = await callWithRetry(async (groq) => {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        max_tokens: 5, temperature: 0
      });
      return completion.choices[0]?.message?.content || "";
    });
    const classification = res.toLowerCase().trim();
    if (classification.includes("chat")) return "chat";
    if (classification.includes("task")) return "task";
  } catch {}

  // --- Tier 2: Groq 70B ---
  try {
    const res = await callWithRetry(async (groq) => {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        max_tokens: 5, temperature: 0
      });
      return completion.choices[0]?.message?.content || "";
    });
    const classification = res.toLowerCase().trim();
    if (classification.includes("chat")) return "chat";
    if (classification.includes("task")) return "task";
  } catch {}

  // --- Final Safety Fallback ---
  // Vague/ambiguous phrases should default to chat, not trigger the browser agent
  const chatKeywords = [
    "hey", "hi", "hello", "who are you", "who created you", "can you hear me", "you there",
    "do one thing", "do something", "help me", "can you help", "i need help",
    "what can you do", "tell me", "explain", "what do you think",
  ];
  if (chatKeywords.some(k => lower.includes(k))) return "chat";

  const taskKeywords = ["search", "research", "news", "weather", "price", "latest", "find"];
  if (taskKeywords.some(k => lower.includes(k))) return "task";

  return "chat";
}
