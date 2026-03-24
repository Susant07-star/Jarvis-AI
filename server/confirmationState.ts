/**
 * confirmationState.ts — Shared singleton for pending task confirmations.
 *
 * Why this exists:
 *   The JARVIS frontend sends audio via WebSocket but text via the HTTP API.
 *   A plan can be created during a voice command (WS) but confirmed via text (API)
 *   or vice-versa. Without a shared module, the two routes hold separate
 *   `pendingConfirmation` variables and confirmation responses get misrouted to
 *   the wrong handler — the pending plan is never executed.
 *
 * Usage:
 *   import { pendingConfirmation, setPendingConfirmation, clearPendingConfirmation } from '../confirmationState';
 */

export interface PendingPlan {
  actions: any[];
  goal: string;
}

let _pending: PendingPlan | null = null;

/** Returns the currently queued pending plan, or null if there is none. */
export function getPendingConfirmation(): PendingPlan | null {
  return _pending;
}

/** Cache a plan that requires confirmation before execution. */
export function setPendingConfirmation(plan: PendingPlan): void {
  _pending = plan;
}

/** Remove the pending plan (after confirmed, declined, or timed out). */
export function clearPendingConfirmation(): void {
  _pending = null;
}

/** Convenience: returns true if there is a plan waiting. */
export function hasPendingConfirmation(): boolean {
  return _pending !== null;
}
