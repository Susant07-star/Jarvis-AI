/**
 * confirmationState.ts — Shared singleton for pending task confirmations.
 *
 * Why this exists:
 *   The JARVIS frontend sends audio via WebSocket but text via the HTTP API.
 *   A plan can be created during a voice command (WS) but confirmed via text (API)
 *   or vice‑versa. Without a shared module, the two routes hold separate
 *   `pendingConfirmation` variables and confirmation responses get misrouted to
 *   the wrong handler — the pending plan is never executed.
 *
 * Enhanced with Session State Manager for Phase 1 Stabilization:
 *   - pending_plan with metadata (timestamp, source)
 *   - awaiting_confirmation flag
 *   - checkConfirmationInput() to parse yes/no/new command
 *   - Centralized logging for state transitions
 */

import { logger } from "./logger";

export interface PendingPlan {
  actions: any[];
  goal: string;
  timestamp: number;
  source: string; // 'api' or 'websocket'
}

export interface SessionState {
  pendingPlan: PendingPlan | null;
  awaitingConfirmation: boolean;
  timestamp: number;
}

export interface ConfirmationResult {
  handled: boolean;
  type: 'confirmed' | 'cancelled' | 'new_command' | 'ambiguous';
  plan?: PendingPlan;
  message?: string;
}

let _pending: PendingPlan | null = null;

/** Returns the currently queued pending plan, or null if there is none. */
export function getPendingConfirmation(): PendingPlan | null {
  return _pending;
}

/** Cache a plan that requires confirmation before execution. */
export function setPendingConfirmation(plan: PendingPlan): void {
  _pending = plan;
  logger.info("[STATE]", `Plan stored (${plan.actions.length} steps) from ${plan.source}`);
  logger.info("[STATE]", `awaiting_confirmation = true`);
}

/** Remove the pending plan (after confirmed, declined, or timed out). */
export function clearPendingConfirmation(): void {
  if (_pending) {
    logger.info("[STATE]", `Clearing pending plan: ${_pending.goal}`);
  }
  _pending = null;
}

/** Convenience: returns true if there is a plan waiting. */
export function hasPendingConfirmation(): boolean {
  return _pending !== null;
}

/** Get full session state */
export function getSessionState(): SessionState {
  return {
    pendingPlan: _pending,
    awaitingConfirmation: _pending !== null,
    timestamp: Date.now()
  };
}

/**
 * Check user input against pending confirmation state.
 * This function MUST be called BEFORE IntentClassifier.
 * 
 * Rules:
 * - If awaiting_confirmation = true:
 *   - "yes" → execute stored plan (DO NOT re-plan)
 *   - "no" → cancel plan
 *   - new command → discard old plan and process new
 *   - ambiguous → reprompt
 */
export function checkConfirmationInput(userInput: string): ConfirmationResult {
  const lowerInput = userInput.toLowerCase().trim();
  
  const confirmPhrases = ['yes', 'y', 'confirm', 'go on', 'please do it', 'do it', 'sure', 'ok'];
  const declinePhrases = ['no', 'n', 'cancel', 'stop'];

  // Detect yes/no even without pending confirmation
  const isYes = confirmPhrases.some(p => lowerInput === p || lowerInput.startsWith(p + ' '));
  const isNo = declinePhrases.some(p => lowerInput === p || lowerInput.startsWith(p + ' '));

  // No pending confirmation → treat yes/no as ambiguous, otherwise pass through
  if (!hasPendingConfirmation()) {
    if (isYes || isNo) {
      logger.info("[STATE]", `Yes/no input without pending confirmation: "${userInput}"`);
      return { 
        handled: true, 
        type: 'ambiguous',
        message: "There is no pending task to confirm."
      };
    }
    return { handled: false, type: 'new_command' };
  }
  
  const pending = getPendingConfirmation()!;
  
  // Check for confirmation using precomputed isYes/isNo
  if (isYes) {
    logger.info("[STATE]", `Confirmation received: YES`);
    logger.info("[STATE]", `Executing stored plan: ${pending.goal}`);
    return { 
      handled: true, 
      type: 'confirmed', 
      plan: pending,
      message: "Confirmed task executed."
    };
  }
  
  // Check for cancellation
  if (isNo) {
    logger.info("[STATE]", `Confirmation received: NO`);
    logger.info("[STATE]", `Cancelling pending plan`);
    clearPendingConfirmation();
    return { 
      handled: true, 
      type: 'cancelled',
      message: "Action cancelled."
    };
  }
  
  // Check if this looks like a new command (contains action keywords)
  const actionKeywords = [
    'open', 'click', 'search', 'scroll', 'play', 'pause', 'type', 
    'navigate', 'go to', 'close tab', 'like', 'subscribe', 'comment',
    'fill', 'add', 'enter', 'choose', 'select', 'field', 'input', 'button'
  ];
  
  const isNewCommand = actionKeywords.some(kw => lowerInput.includes(kw));
  if (isNewCommand) {
    logger.info("[STATE]", `New command received while awaiting confirmation`);
    logger.info("[STATE]", `Discarding old plan: ${pending.goal}`);
    clearPendingConfirmation();
    return { handled: true, type: 'new_command' };
  }
  
  // Ambiguous input - neither yes/no nor new command
  logger.info("[STATE]", `Ambiguous input while awaiting confirmation: "${userInput}"`);
  return { 
    handled: true, 
    type: 'ambiguous',
    message: "Please confirm the previous task (yes/no)"
  };
}

/**
 * Set pending plan with metadata
 */
export function setPendingPlanWithMetadata(actions: any[], goal: string, source: string): void {
  const plan: PendingPlan = {
    actions,
    goal,
    timestamp: Date.now(),
    source
  };
  setPendingConfirmation(plan);
}
