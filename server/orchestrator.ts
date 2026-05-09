import { classifyIntent, IntentType } from "./intentClassifier";
import { logger } from "./logger";
import { checkConfirmationInput, ConfirmationResult } from "./confirmationState";

export type OrchestratorMode = "direct" | "agent";

export interface OrchestratorDecision {
  mode: OrchestratorMode;
  intent: IntentType;
  requiresPlanning: boolean;
  originalInput: string;
  normalizedInput?: string;
  tokens?: number;
  // If present, indicates the input was a confirmation response
  confirmationResult?: ConfirmationResult;
}

/**
 * Core System Orchestrator:
 * Decides whether the input triggers a conversational response directly,
 * or if it requires the Browser Planner to execute automated tasks.
 * 
 * Enhanced with State Guard: checks confirmation state BEFORE intent classification.
 * If the input is a confirmation response (yes/no), returns with confirmationResult.
 */
export async function determineOrchestrationMode(userInput: string): Promise<OrchestratorDecision> {
  const t0 = Date.now();
  
  // 0. STATE GUARD: Check confirmation state BEFORE intent classification
  const confirmationCheck = checkConfirmationInput(userInput);
  if (confirmationCheck.handled) {
    const duration = Date.now() - t0;
    logger.info("Orchestrator", `Confirmation handled in ${duration}ms: TYPE=[${confirmationCheck.type.toUpperCase()}]`);
    
    // Return a decision with confirmation result
    // Mode is 'direct' for confirmation responses (they don't need planning)
    return {
      mode: "direct",
      intent: "chat", // Confirmation responses are treated as chat intent
      requiresPlanning: false,
      originalInput: userInput,
      confirmationResult: confirmationCheck
    };
  }
  
  // 1. Identify intent (only if not a confirmation response)
  const classification = await classifyIntent(userInput);
  
  // 2. Map intent to execution mode
  let mode: OrchestratorMode;
  let requiresPlanning = false;

  if (classification === "task") {
    // Action required in browser
    mode = "agent";
    requiresPlanning = true;
  } else {
    // Conversational Q&A / Idle chatter
    mode = "direct";
    requiresPlanning = false;
  }

  const duration = Date.now() - t0;
  
  // DEEP DEBUGGING: Log the intent decision with the input for clarity
  logger.info("Orchestrator", `Decision for "${userInput.substring(0, 50)}...": MODE=[${mode.toUpperCase()}] PLAN=[${requiresPlanning}] (Classifier: ${classification})`);

  return {
    mode,
    intent: classification as any,
    requiresPlanning,
    originalInput: userInput
  };
}
