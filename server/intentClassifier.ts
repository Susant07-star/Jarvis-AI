import { getGroqClient, callWithRetry } from "./llm";
import { logger } from "./logger";

export type IntentType = "chat" | "task";

interface IntentClassification {
  type: IntentType;
  confidence: number;
  reason: string;
  tokens?: number;
  normalized_task?: string;
}

/**
 * Rapidly classifies if the user wants to simply chat (direct) or execute an action (agent).
 */
export async function classifyIntent(userInput: string): Promise<IntentClassification> {
  // 1. Basic keyword heuristic fast-path
  const lowerInput = userInput.toLowerCase();
  const taskKeywords = [
    "open", "click", "search", "scroll", "play", "pause", "type", 
    "navigate", "go to", "close tab", "like", "subscribe", "comment",
    "fill", "add", "enter", "choose", "select", "field", "input", "button"
  ];
  const chatKeywords = [
    "what is", "who is", "tell me", "explain", "how do", "why", "hello", "hi", "hey"
  ];

  const hasTaskKeyword = taskKeywords.some(kw => lowerInput.includes(kw));
  const hasChatKeyword = chatKeywords.some(kw => lowerInput.includes(kw));

  const wordCount = userInput.trim().split(/\s+/).length;

  // 1. Basic keyword heuristic fast-path (only for short, direct commands)
  if (wordCount <= 6) {
    const hasTaskKeyword = taskKeywords.some(kw => lowerInput.includes(kw));
    const hasChatKeyword = chatKeywords.some(kw => lowerInput.includes(kw));

    // If it clearly expresses an action verb with no conversational question
    if (hasTaskKeyword && !hasChatKeyword) {
      logger.info("IntentClassifier", `Fast-path routed to TASK: "${userInput}"`);
      return { type: "task", confidence: 0.9, reason: "Keyword match", normalized_task: userInput };
    }
    
    if (hasChatKeyword && !hasTaskKeyword) {
      logger.info("IntentClassifier", `Fast-path routed to CHAT: "${userInput}"`);
      return { type: "chat", confidence: 0.9, reason: "Keyword match" };
    }
  }

  // 2. LLM classification for ambiguous or verbose inputs
  try {
    const rawResult = await callWithRetry(async (groq) => {
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are a routing classifier for J.A.R.V.I.S., a voice-controlled browser agent.
Classify user input as EITHER "chat" OR "task". Respond with JSON only.

RULES:
- "task": User is explicitly directing J.A.R.V.I.S. to perform a physical browser action (click, open, navigate, search, play, pause, scroll, type into, etc.)
- "chat": Everything else — questions, statements, idioms, status updates, greetings, confirmations, ambiguous phrases.

CRITICAL — Do NOT classify as "task":
- Idioms or figures of speech: "It's looking up", "Things are picking up", "Sounds good"
- Status updates / observations: "It's done", "Looking good", "That worked", "It's loading"
- Non-explicit indirect references: "look up", "check it", "that one"
- Questions and chat: "Can you hear me?", "What is AI?", "Hello", "Thanks", "Go on"

Output ONLY valid JSON:
{
  "type": "chat" | "task",
  "reason": "one sentence",
  "normalized_task": "precise actionable command (ONLY include if type is task, e.g. 'open youtube', 'play video', 'like video')"
}`
          },
          { role: "user", content: userInput }
        ],
        response_format: { type: "json_object" },
        max_tokens: 150,
        temperature: 0,
      });
      return { 
        content: response.choices[0]?.message?.content || '{"type": "chat", "reason": "fallback"}',
        tokens: response.usage?.total_tokens || 0
      };
    });

    const parsed = JSON.parse(rawResult.content) as { type: string, reason: string, normalized_task?: string };
    const type: IntentType = parsed.type === "task" ? "task" : "chat";
    
    logger.info("IntentClassifier", `LLM routed to ${type.toUpperCase()}: "${userInput}" (${parsed.reason}) -> Normalized: ${parsed.normalized_task || 'N/A'}`);
    return { type, confidence: 0.8, reason: parsed.reason, tokens: rawResult.tokens, normalized_task: parsed.normalized_task };
  } catch (error) {
    logger.error("IntentClassifier", "LLM fallback failed, defaulting to chat", error);
    return { type: "chat", confidence: 0.1, reason: "Error fallback", tokens: 0 };
  }
}
