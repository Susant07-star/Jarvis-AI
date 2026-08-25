/**
 * timezoneStore.ts — Global Timezone Singleton
 * =============================================
 * Stores the user's selected timezone from the UI dropdown.
 * All server-side pipelines (prompt_builder, planner, scheduler) 
 * read from this store to get the correct time context.
 * 
 * Default: "Asia/Kathmandu" (Boss's home timezone).
 * Updated dynamically when the user changes the dropdown via POST /api/config/timezone.
 */

import { logger } from "./logger";

let currentTimezone = "Asia/Kathmandu";

export function setTimezone(tz: string) {
  if (tz && tz !== currentTimezone) {
    logger.info("TimezoneStore", `Timezone updated: ${currentTimezone} → ${tz}`);
    currentTimezone = tz;
  }
}

export function getTimezone(): string {
  return currentTimezone;
}

/**
 * Returns a formatted time context block for injection into LLM system prompts.
 * Computed fresh on every call — NEVER cached.
 */
export function getTimeContextBlock(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { timeZone: currentTimezone, weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { timeZone: currentTimezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return `\n\n### 📅 CURRENT CONTEXT (REAL-TIME — ALWAYS ACCURATE):\n- Timezone: ${currentTimezone}\n- Date: ${dateStr}\n- Time: ${timeStr}`;
}
