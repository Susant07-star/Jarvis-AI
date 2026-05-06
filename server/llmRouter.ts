import { logger } from "./logger";

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
  call: (systemPrompt: string) => Promise<PlannerResponse>;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function getRandomKey(keyPool?: string): string {
  if (!keyPool) return "";
  const keys = keyPool.split(",").map((k) => k.trim()).filter(Boolean);
  return keys[Math.floor(Math.random() * keys.length)] || "";
}

// ── Provider Factory ─────────────────────────────────────────────────────────

function createOpenAICompatibleProvider(name: string, model: string, baseUrl: string, envKey: string | undefined): Provider {
  return {
    name,
    model,
    isAvailable: () => !!envKey,
    call: async (systemPrompt: string): Promise<PlannerResponse> => {
      const apiKey = getRandomKey(envKey);
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ 
          model, 
          messages: [{ role: "system", content: systemPrompt }], 
          temperature: 0, 
          response_format: { type: "json_object" } 
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

// ── Provider Definitions (Based on User Research) ────────────────────────────

// SAMBANOVA POOL
const sambaNovaV32 = createOpenAICompatibleProvider("SambaNova", "DeepSeek-V3.2", "https://api.sambanova.ai/v1/chat/completions", process.env.SAMBANOVA_API_KEY);
const sambaNovaV31 = createOpenAICompatibleProvider("SambaNova", "DeepSeek-V3.1", "https://api.sambanova.ai/v1/chat/completions", process.env.SAMBANOVA_API_KEY);
const sambaNovaGptOss = createOpenAICompatibleProvider("SambaNova", "gpt-oss-120b", "https://api.sambanova.ai/v1/chat/completions", process.env.SAMBANOVA_API_KEY);
const sambaNovaLlama33 = createOpenAICompatibleProvider("SambaNova", "Meta-Llama-3.3-70B-Instruct", "https://api.sambanova.ai/v1/chat/completions", process.env.SAMBANOVA_API_KEY);

// GROQ POOL
const groqGptOss = createOpenAICompatibleProvider("Groq", "gpt-oss-120b", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY);
const groqLlama70B = createOpenAICompatibleProvider("Groq", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY);

// CEREBRAS POOL
const cerebrasGptOss = createOpenAICompatibleProvider("Cerebras", "gpt-oss-120b", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY);
const cerebrasGlm4 = createOpenAICompatibleProvider("Cerebras", "glm-4.7", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY);
const cerebrasLlama70B = createOpenAICompatibleProvider("Cerebras", "llama3.1-70b", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY);

// ── Model Priority Cascade ────────────────────────────────────────────────────

/**
 * JARVIS BRAIN PRIORITY (Strongest to Weakest):
 * 1. DeepSeek V3.2 / V3.1 (Logic Kings)
 * 2. GPT-OSS 120B (The Giant Thinking models)
 * 3. Llama 3.3 / 70B (The Fast Agents)
 * 4. GLM 4.7 (Specialized)
 */
const PROVIDER_PRIORITY: Provider[] = [
  // Tier 1: Logic Leaders
  sambaNovaV32,
  sambaNovaV31,

  // Tier 2: The 120B Heavyweights
  sambaNovaGptOss,
  groqGptOss,
  cerebrasGptOss,

  // Tier 3: The Fast 70B Agents
  sambaNovaLlama33,
  groqLlama70B,
  cerebrasLlama70B,

  // Tier 4: Specialty
  cerebrasGlm4
];

export async function callPlannerWithCascade(systemPrompt: string): Promise<PlannerResponse> {
  const available = PROVIDER_PRIORITY.filter((p) => p.isAvailable());

  if (available.length === 0) {
    throw new Error("No LLM provider configured. Set SAMBANOVA_API_KEY, GROQ_API_KEY, etc.");
  }

  for (let i = 0; i < available.length; i++) {
    const provider = available[i];
    let attempts = 0;
    const MAX_ATTEMPTS = 2;

    while (attempts < MAX_ATTEMPTS) {
      try {
        logger.info("LLMRouter", `[Attempt ${attempts + 1}] Calling ${provider.name}:${provider.model}`);
        const result = await provider.call(systemPrompt);
        return result;
      } catch (err: any) {
        attempts++;
        if (err?.status === 429 || i < available.length - 1) {
          logger.warn("LLMRouter", `⚠️ ${provider.name}:${provider.model} failed/limited. Cascading...`);
          break; // Move to next provider
        }
        if (attempts < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error("All LLM brains exhausted.");
}
