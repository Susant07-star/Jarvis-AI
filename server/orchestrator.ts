import { classifyIntent, IntentType } from "./intentClassifier";
import { logger } from "./logger";

export type OrchestratorMode = "direct" | "agent";

export interface OrchestratorDecision {
  mode: OrchestratorMode;
  intent: IntentType;
  requiresPlanning: boolean;
  originalInput: string;
  normalizedInput?: string;
  tokens?: number;
}

/**
 * Core System Orchestrator:
 * Decides whether the input triggers a conversational response directly,
 * or if it requires the Browser Planner to execute automated tasks.
 */
export async function determineOrchestrationMode(userInput: string): Promise<OrchestratorDecision> {
  const t0 = Date.now();
  
  // 1. Identify intent
  const classification = await classifyIntent(userInput);
  
  // 2. Map intent to execution mode
  let mode: OrchestratorMode;
  let requiresPlanning = false;

  if (classification.type === "task") {
    // Action required in browser
    mode = "agent";
    requiresPlanning = true;
  } else {
    // Conversational Q&A / Idle chatter
    mode = "direct";
    requiresPlanning = false;
  }

  const duration = Date.now() - t0;
  
  logger.info("Orchestrator", `Decision made in ${duration}ms: MODE=[${mode.toUpperCase()}] PLAN=[${requiresPlanning}]`);

  return {
    mode,
    intent: classification.type,
    requiresPlanning,
    originalInput: userInput,
    normalizedInput: classification.normalized_task,
    tokens: classification.tokens
  };
}
