import { logger } from "./logger";
import { GoogleGenAI } from "@google/genai";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannerResponse {
  content: string;
  tokens: number;
  provider: string;
  model: string;
}

interface Provider {
  name: string;
  model: string;
  isAvailable: () => boolean;
  call: (systemPrompt: string, forceJson?: boolean) => Promise<PlannerResponse>;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function getRandomKey(keyPool?: string): string {
  if (!keyPool) return "";
  const keys = keyPool.split(",").map((k) => k.trim()).filter(Boolean);
  return keys[Math.floor(Math.random() * keys.length)] || "";
}

// ── Provider Factory ─────────────────────────────────────────────────────────

function createOpenAICompatibleProvider(name: string, model: string, baseUrl: string, envVarName: string): Provider {
  return {
    name,
    model,
    isAvailable: () => !!process.env[envVarName],
    call: async (systemPrompt: string, forceJson: boolean = true): Promise<PlannerResponse> => {
      const apiKey = getRandomKey(process.env[envVarName]);
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }],
          temperature: forceJson ? 0 : 0.7,
          ...(forceJson ? { response_format: { type: "json_object" } } : {})
        }),
      });
      if (!response.ok) throw new Error(`${name} API error: ${response.status} ${await response.text()}`);
      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || "{}",
        tokens: data.usage?.total_tokens || 0,
        provider: name,
        model
      };
    },
  };
}

function createGeminiProvider(name: string, model: string, envVarName: string): Provider {
  return {
    name,
    model,
    isAvailable: () => !!process.env[envVarName],
    call: async (systemPrompt: string, forceJson: boolean = true): Promise<PlannerResponse> => {
      const apiKey = getRandomKey(process.env[envVarName]);
      const genAI = new GoogleGenAI({ apiKey });

      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: {
          responseMimeType: forceJson ? "application/json" : "text/plain",
          temperature: forceJson ? 0 : 0.7,
        },
      });

      const content = response.text ?? "";

      return {
        content: content || (forceJson ? "{}" : ""),
        tokens: response.usageMetadata?.totalTokenCount || 0,
        provider: name,
        model,
      };
    },
  };
}

function createGeminiChatProvider(name: string, model: string, envVarName: string): Provider {
  return {
    name,
    model,
    isAvailable: () => !!process.env[envVarName],
    call: async (fullPrompt: string, _forceJson: boolean = false): Promise<PlannerResponse> => {
      const apiKey = getRandomKey(process.env[envVarName]);
      const genAI = new GoogleGenAI({ apiKey });

      // Parse the pre-built prompt into system + message parts
      const sysMatch = fullPrompt.match(/^(.*?)\n\nConversation Context:.*?\n\nUser: (.*)$/s);
      const systemInstruction = sysMatch?.[1] ?? "";
      const userMessage = sysMatch?.[2] ?? fullPrompt;

      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: {
          systemInstruction,
          responseMimeType: "text/plain",
          temperature: 0.7,
        },
      });

      const content = response.text ?? "";
      return {
        content: content || "",
        tokens: response.usageMetadata?.totalTokenCount || 0,
        provider: name,
        model,
      };
    },
  };
}

// ── Provider Definitions (Based on User Research) ────────────────────────────

// SAMBANOVA POOL
const sambaNovaV32 = createOpenAICompatibleProvider("SambaNova", "DeepSeek-V3.2", "https://api.sambanova.ai/v1/chat/completions", "SAMBANOVA_API_KEY");
const sambaNovaV31 = createOpenAICompatibleProvider("SambaNova", "DeepSeek-V3.1", "https://api.sambanova.ai/v1/chat/completions", "SAMBANOVA_API_KEY");
const sambaNovaGptOss = createOpenAICompatibleProvider("SambaNova", "gpt-oss-120b", "https://api.sambanova.ai/v1/chat/completions", "SAMBANOVA_API_KEY");
const sambaNovaLlama33 = createOpenAICompatibleProvider("SambaNova", "Meta-Llama-3.3-70B-Instruct", "https://api.sambanova.ai/v1/chat/completions", "SAMBANOVA_API_KEY");

// GROQ POOL
const groqGptOss = createOpenAICompatibleProvider("Groq", "gpt-oss-120b", "https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY");
const groqLlama70B = createOpenAICompatibleProvider("Groq", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY");

// CEREBRAS POOL
const cerebrasGptOss = createOpenAICompatibleProvider("Cerebras", "gpt-oss-120b", "https://api.cerebras.ai/v1/chat/completions", "CEREBRAS_API_KEY");
const cerebrasGlm4 = createOpenAICompatibleProvider("Cerebras", "glm-4.7", "https://api.cerebras.ai/v1/chat/completions", "CEREBRAS_API_KEY");
const cerebrasLlama70B = createOpenAICompatibleProvider("Cerebras", "llama3.1-70b", "https://api.cerebras.ai/v1/chat/completions", "CEREBRAS_API_KEY");

// GEMINI POOL (JSON/Planner) — generateContent REST API model names
const gemini31FlashLite = createGeminiProvider("Google", "gemini-3.1-flash-lite-preview", "GEMINI_API_KEY");
const gemini25Flash = createGeminiProvider("Google", "gemini-2.5-flash", "GEMINI_API_KEY");

// GEMINI POOL (Chat - uses systemInstruction for proper prompt separation)
const gemini31FlashLiteChat = createGeminiChatProvider("Google", "gemini-3.1-flash-lite-preview", "GEMINI_API_KEY");
const gemini25FlashChat = createGeminiChatProvider("Google", "gemini-2.5-flash", "GEMINI_API_KEY");

// ── Model Priority Cascade ────────────────────────────────────────────────────

const PROVIDER_PRIORITY: Provider[] = [
  gemini31FlashLite,
  gemini25Flash,
  sambaNovaV32,
  sambaNovaV31,
  sambaNovaGptOss,
  groqGptOss,
  cerebrasGptOss,
  sambaNovaLlama33,
  groqLlama70B,
  cerebrasLlama70B,
  cerebrasGlm4
];

const CHAT_PROVIDER_PRIORITY: Provider[] = [
  gemini31FlashLiteChat,
  gemini25FlashChat,
  sambaNovaV32,
  sambaNovaV31,
  groqLlama70B,
  cerebrasLlama70B,
];

export async function callPlannerWithCascade(systemPrompt: string): Promise<PlannerResponse> {
  const available = PROVIDER_PRIORITY.filter((p) => p.isAvailable());
  if (available.length === 0) throw new Error("No LLM provider configured.");

  for (let i = 0; i < available.length; i++) {
    const provider = available[i];
    let keyRetries = 3;
    let attempt = 0;

    while (attempt < keyRetries) {
      try {
        return await provider.call(systemPrompt, true);
      } catch (err: any) {
        if (attempt < keyRetries - 1) {
          attempt++;
          continue;
        }
        break;
      }
    }
  }
  throw new Error("All LLM brains exhausted during planning.");
}

export async function callChatWithCascade(systemPrompt: string, userMessage: string, pastMemory: any[] = []): Promise<PlannerResponse> {
  const available = CHAT_PROVIDER_PRIORITY.filter((p) => p.isAvailable());
  if (available.length === 0) throw new Error("No LLM provider configured.");

  const fullPrompt = `${systemPrompt}\n\nConversation Context: ${JSON.stringify(pastMemory.slice(-20))}\n\nUser: ${userMessage}`;

  for (let i = 0; i < available.length; i++) {
    const provider = available[i];
    let keyRetries = 3;
    let attempt = 0;

    while (attempt < keyRetries) {
      try {
        return await provider.call(fullPrompt, false);
      } catch (err: any) {
        if (attempt < keyRetries - 1) {
          attempt++;
          continue;
        }
        break;
      }
    }
  }
  throw new Error("All LLM brains exhausted during chat.");
}

export async function callResearchWithCascade(query: string): Promise<string> {
  const apiKey = getRandomKey(process.env.GEMINI_API_KEY);
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

  const genAI = new GoogleGenAI({ apiKey });
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  try {
    logger.info("LLMRouter", `[Research] Calling Gemini 2.5 Flash for query: "${query}"`);
    const result = await (model as any).generateContent({
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    });

    return result.response.text();
  } catch (err: any) {
    logger.error("LLMRouter", `[Research] Gemini 2.5 Flash failed: ${err.message}`);
    const backupModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
    const backupResult = await backupModel.generateContent(query);
    return backupResult.response.text();
  }
}
