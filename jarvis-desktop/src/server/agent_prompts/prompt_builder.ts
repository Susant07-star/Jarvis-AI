/**
 * prompt_builder.ts — Modular Prompt Assembler for J.A.R.V.I.S.
 *
 * PURPOSE:
 *   Loads agent-specific prompt configs and assembles only the relevant
 *   modules into a single system prompt string. This keeps LLM token
 *   usage minimal by sending ONLY what each agent needs.
 *
 * ARCHITECTURE:
 *   agent_prompts/
 *     modules/       ← Reusable building blocks (personality, tools, etc.)
 *     agents/        ← Agent configs that reference which modules to use
 *     prompt_builder.ts  ← THIS FILE — loads and assembles everything
 *
 * USAGE:
 *   import { buildPrompt } from "./agent_prompts/prompt_builder";
 *   const systemPrompt = buildPrompt("browser");
 *   // Returns assembled prompt: personality + tools + behavior + DOM
 *
 * HOW TO ADD A NEW AGENT:
 *   1. Create modules/your_module.json with { id, prompt } fields
 *   2. Create agents/your_agent_prompt.json with { modules: [...] }
 *   3. Call buildPrompt("your_agent") — it works automatically
 *
 * DATABASE MIGRATION (FUTURE):
 *   Replace the fs.readFileSync calls with database queries.
 *   The public API (buildPrompt) stays the same.
 *   Only the internal _loadModule() and _loadAgentConfig() need to change.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { getTimeContextBlock } from "../timezoneStore";

// ─── PATHS ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULES_DIR = path.join(__dirname, "modules");
const AGENTS_DIR = path.join(__dirname, "agents");

// ─── CACHING ──────────────────────────────────────────────────────────────────
// Cache loaded modules in memory to avoid re-reading files on every request.
// Clear cache by calling clearPromptCache() if you hot-reload modules.

const moduleCache: Record<string, string> = {};
const agentConfigCache: Record<string, AgentConfig> = {};

interface AgentConfig {
  agent: string;
  description: string;
  modules: string[];
  max_tokens_hint?: number;
  vision_prompt?: string;
}

// ─── INTERNAL LOADERS ─────────────────────────────────────────────────────────
// FUTURE DATABASE MIGRATION:
//   Replace _loadModule() with: SELECT prompt FROM modules WHERE id = :id
//   Replace _loadAgentConfig() with: SELECT * FROM agents WHERE name = :name

function _loadModule(moduleId: string): string {
  // Check cache first
  if (moduleCache[moduleId]) {
    return moduleCache[moduleId];
  }

  // Allow overriding the core personality via Environment Variables for separate deployments
  if (moduleId === "personality" && process.env.CUSTOM_SYSTEM_PROMPT) {
    return process.env.CUSTOM_SYSTEM_PROMPT;
  }

  const filePath = path.join(MODULES_DIR, `${moduleId}.json`);

  if (!fs.existsSync(filePath)) {
    console.warn(`[PromptBuilder] Module not found: ${moduleId}`);
    return "";
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const prompt = data.prompt || "";

    // Cache it
    moduleCache[moduleId] = prompt;
    return prompt;
  } catch (err) {
    console.error(`[PromptBuilder] Error loading module ${moduleId}:`, err);
    return "";
  }
}

function _loadAgentConfig(agentName: string): AgentConfig | null {
  // Check cache first
  if (agentConfigCache[agentName]) {
    return agentConfigCache[agentName];
  }

  const filePath = path.join(AGENTS_DIR, `${agentName}_agent_prompt.json`);

  if (!fs.existsSync(filePath)) {
    console.warn(`[PromptBuilder] Agent config not found: ${agentName}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(raw) as AgentConfig;

    // Cache it
    agentConfigCache[agentName] = config;
    return config;
  } catch (err) {
    console.error(`[PromptBuilder] Error loading agent config ${agentName}:`, err);
    return null;
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Build the system prompt for a specific agent.
 *
 * @param agentName - "voice" | "browser" | "vision" (or any custom agent)
 * @returns The assembled system prompt string
 *
 * @example
 *   const prompt = buildPrompt("browser");
 *   // Returns: personality + tools + behavior + DOM rules
 *
 *   const prompt = buildPrompt("voice");
 *   // Returns: personality + behavior rules only (minimal tokens)
 */
export function buildPrompt(agentName: string): string {
  const config = _loadAgentConfig(agentName);

  if (!config) {
    // Fallback: return a minimal personality-only prompt
    console.warn(`[PromptBuilder] Falling back to personality-only for: ${agentName}`);
    return _loadModule("personality");
  }

  // Assemble: load each referenced module and join them
  const parts: string[] = [];

  for (const moduleId of config.modules) {
    const modulePrompt = _loadModule(moduleId);
    if (modulePrompt) {
      parts.push(modulePrompt);
    }
  }

  // If the agent has a special vision_prompt, append it
  if (config.vision_prompt) {
    parts.push(config.vision_prompt);
  }

  const assembled = parts.join("\n\n");

  // ── Inject Real-Time Date/Time Context (computed fresh every call) ──────
  // Uses the user's selected timezone from the UI dropdown (via timezoneStore).
  const finalPrompt = assembled + getTimeContextBlock();

  // Approximate token count (roughly 4 chars per token)
  const approxTokens = Math.ceil(finalPrompt.length / 4);
  const maxTokens = config.max_tokens_hint || Infinity;

  if (approxTokens > maxTokens) {
    console.warn(
      `[PromptBuilder] ⚠️ WARNING: Assembled prompt for "${agentName}" exceeds max_tokens_hint!`
    );
    console.warn(`[PromptBuilder] Expected < ${maxTokens} tokens, but got ~${approxTokens} (${finalPrompt.length} chars).`);
    console.warn(`[PromptBuilder] Consider removing modules or shrinking documentation to avoid API cost bloat.`);
  }

  console.log(
    `[PromptBuilder] Built "${agentName}" prompt: ${config.modules.length} modules, ~${approxTokens} tokens`
  );

  return finalPrompt;
}

/**
 * Get the list of available agent names.
 */
export function getAvailableAgents(): string[] {
  try {
    const files = fs.readdirSync(AGENTS_DIR);
    return files
      .filter((f) => f.endsWith("_agent_prompt.json"))
      .map((f) => f.replace("_agent_prompt.json", ""));
  } catch {
    return [];
  }
}

/**
 * Get the list of available module names.
 */
export function getAvailableModules(): string[] {
  try {
    const files = fs.readdirSync(MODULES_DIR);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Clear the in-memory cache. Call this if you hot-reload modules at runtime.
 */
export function clearPromptCache(): void {
  Object.keys(moduleCache).forEach((key) => delete moduleCache[key]);
  Object.keys(agentConfigCache).forEach((key) => delete agentConfigCache[key]);
  console.log("[PromptBuilder] Cache cleared.");
}
