import { callPlannerWithCascade } from '../llmRouter';
import { ThreadMessage } from '../threadManager';
import { BrowserAction, memory, tracker } from './executor';
import { logger } from '../logger';
import fs from 'fs';
import path from 'path';

// ── Real-time context injected into every planner call (NEVER cached) ─────────
function getPlannerTimeContext(): string {
    const TIMEZONE = "Asia/Kathmandu";
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { timeZone: TIMEZONE, weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    return `\nCURRENT TIME CONTEXT (use for scheduling calculations):\n- Timezone: ${TIMEZONE}\n- Date: ${dateStr}\n- Time: ${timeStr}`;
}

// ── Shared hardened Planner LLM call ─────────────────────────────────────────
// Uses the multi-provider LLM cascade (GPT-4o → DeepSeek → Llama).
// Validates JSON output, retries ONCE on parse failure, logs raw output.
async function callPlannerLLM(systemPrompt: string, userPrompt?: string, imageBase64?: string): Promise<{ parsed: any; tokens: number; model: string; provider: string }> {
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let rawOutput = '';
        let tokens = 0;
        let model = 'unknown';
        let provider = 'unknown';

        try {
            const messages: ThreadMessage[] = [{ role: 'system', content: systemPrompt }];
            if (userPrompt) messages.push({ role: 'user', content: userPrompt });
            const result = await callPlannerWithCascade(messages, imageBase64);
            rawOutput = result.content;
            tokens = result.tokens;
            model = result.model;
            provider = result.provider;

            logger.debug("Planner", `[Attempt ${attempt}/${MAX_ATTEMPTS}] Provider: ${provider}/${model} | Raw: ${rawOutput}`);
        } catch (providerErr: any) {
            logger.error("Planner", `[Attempt ${attempt}/${MAX_ATTEMPTS}] All providers failed: ${providerErr.message}`);
            if (attempt === MAX_ATTEMPTS) throw providerErr;
            continue;
        }

        // Validation layer: never trust the model blindly
        try {
            const parsed = JSON.parse(rawOutput);

            // Structural validation: must have a 'steps' array
            if (!parsed || !Array.isArray(parsed.steps)) {
                throw new Error(`Missing 'steps' array. Got keys: [${Object.keys(parsed || {}).join(', ')}]`);
            }

            logger.info("Planner", `[Attempt ${attempt}] Valid plan (${parsed.steps.length} steps)`);
            return { parsed, tokens, model, provider };

        } catch (validationError: any) {
            logger.error("Planner", `[Attempt ${attempt}/${MAX_ATTEMPTS}] Bad JSON: ${validationError.message} | Raw snippet: "${rawOutput.slice(0, 300)}"`);

            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Planner returned invalid JSON after ${MAX_ATTEMPTS} attempts. Last error: ${validationError.message}`);
            }
            // Loop to retry
        }
    }

    throw new Error('Planner: unexpected exit from retry loop');
}


// ── createPlan (no DOM context — used before page is analyzed) ────────────────

export async function createPlan(goal: string): Promise<{actions: BrowserAction[], tokens: number, requires_confirmation: boolean, internal_steps?: string[], errorFallback?: string, model?: string, provider?: string}> {
    const pastTask = tracker.getLastTaskForGoal(goal);
    let memoryContext = '';
    if (pastTask) {
        memoryContext = `\nPrevious execution of similar goal "${pastTask.goal}" had status: ${pastTask.status}. Steps: ${pastTask.steps.map(s => `${s.action}(${s.status})`).join(', ')}. Errors: ${pastTask.errors.join('; ') || 'none'}. Avoid repeating failed approaches.`;
    }

    const systemPrompt = `You are the J.A.R.V.I.S. browser task planner.

ABSOLUTE RULE — JSON ONLY:
You MUST ONLY return a valid JSON object. Do NOT include ANY explanation, reasoning, markdown code fences, sentences, or text outside the JSON object. Violations will cause a system crash.

Available actions:
- "open_url" (requires "url")
- "click" (requires "selector")
- "type" (requires "selector", "text")
- "go_back"
- "scroll" (requires "direction": "up" or "down")
- "youtube_search" (requires "query")
- "youtube_click_video"
- "youtube_like"
- "youtube_subscribe"
- "youtube_comment" (requires "text")
- "open_tab" (requires "url")
- "switch_tab" (requires "index")
- "close_tab"
- "close_browser"
- "type_secure" (requires "selector", "text")
- "serp_api_search" (requires "query")
- "media_control" (requires "action": "play"|"pause"|"skip_forward"|"skip_backward")
- "schedule_call" (requires "delay_seconds", "reason")
- "schedule_message" (requires "delay_seconds", "text")

${memoryContext}
${getPlannerTimeContext()}

SECURITY RULE: Set "requires_confirmation": true if actions include: youtube_comment, youtube_subscribe, youtube_like, type_secure, opening untrusted URLs, OR total steps > 3. Trusted domains: youtube.com, google.com, daraz.pk, facebook.com.

REQUIRED OUTPUT FORMAT — always exactly this structure, nothing else:
{
  "requires_confirmation": false,
  "internal_steps": ["Reasoning step 1", "Reasoning step 2"],
  "steps": [
    { "action": "open_url", "url": "https://example.com" },
    { "action": "click", "selector": "#login-btn" }
  ]
}`;

    const userPrompt = `User goal: "${goal}"\n\nCRITICAL: You MUST reply with ONLY a valid JSON object matching the EXACT "REQUIRED OUTPUT FORMAT" from the system instructions. Do NOT invent your own JSON keys or structure.`;

    try {
        const { parsed, tokens, model, provider } = await callPlannerLLM(systemPrompt, userPrompt);
        const actions: BrowserAction[] = parsed.steps || [];
        const requires_confirmation = parsed.requires_confirmation || false;
        const internal_steps: string[] = parsed.internal_steps || [];
        logger.info("Planner", `createPlan done (${actions.length} steps, confirm: ${requires_confirmation})`);
        return { actions, tokens, requires_confirmation, internal_steps, model, provider };
    } catch (e: any) {
        logger.error("Planner", `createPlan failed: ${e.message}`);
        logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: `Planner failed: ${e.message}` })}`);
        return { actions: [], tokens: 0, requires_confirmation: false, internal_steps: [] };
    }
}

// ── planWithDOM (with DOM element context — used after page is analyzed) ──────

export async function planWithDOM(goal: string, domElements: any[]): Promise<{actions: BrowserAction[], tokens: number, requires_confirmation: boolean, internal_steps?: string[], errorFallback?: string, model?: string, provider?: string}> {
    const pastTask = tracker.getLastTaskForGoal(goal);
    let memoryContext = '';
    if (pastTask) {
        memoryContext = `\nPrevious similar task had status: ${pastTask.status}. Avoid repeating failed patterns.`;
    }

    let promptDocs = `
Available actions:
- "open_url" (requires "url")
- "open_tab" (requires "url")
- "switch_tab" (requires "index")
- "close_tab"
- "close_browser"
- "go_back"
- "click" (requires "jarvis_id")
- "type" (requires "jarvis_id", "text")
- "type_secure" (requires "jarvis_id", "text")
- "scroll" (requires "direction": "up" or "down", optional "amount")
- "youtube_search" (requires "query")
- "youtube_click_video"
- "youtube_like"
- "youtube_subscribe"
- "youtube_comment" (requires "text")
- "serp_api_search" (requires "query")
- "media_control" (requires "command": "play"|"pause"|"skip_forward"|"skip_backward")
- "schedule_call" (requires "delay_seconds", "reason")
- "schedule_message" (requires "delay_seconds", "text")

CRITICAL JSON RULE: For "media_control" steps, you MUST use the key "command" (NOT "action") for the sub-action.
Correct:   { "action": "media_control", "command": "play" }
INCORRECT: { "action": "media_control", "action": "play" }  <-- JSON KEY COLLISION, NEVER DO THIS
`;

    let domString = JSON.stringify(domElements, null, 2);
    let totalLength = goal.length + memoryContext.length + domString.length + promptDocs.length;
    const MAX_CHARS = 24000; // ~6000 tokens heuristic

    if (totalLength > MAX_CHARS) {
        logger.warn("Planner", `Prompt exceeds length hint (${totalLength} > ${MAX_CHARS}). Trimming non-essential docs.`);
        // Compact action list
        promptDocs = `Available actions (compact): open_url, open_tab, switch_tab, close_tab, close_browser, go_back, click, type, type_secure, scroll, youtube_search, youtube_click_video, youtube_like, youtube_subscribe, youtube_comment, serp_api_search, media_control.`;
        
        let remainingCharQuota = MAX_CHARS - goal.length - memoryContext.length - promptDocs.length - 1000;
        if (domString.length > remainingCharQuota && remainingCharQuota > 0) {
            const prunedDom = [];
            let currentLen = 0;
            for (const el of domElements) {
                const elStr = JSON.stringify(el);
                if (currentLen + elStr.length > remainingCharQuota) break;
                prunedDom.push(el);
                currentLen += elStr.length;
            }
            domString = JSON.stringify(prunedDom, null, 2);
            logger.warn("Planner", `DOM elements pruned from ${domElements.length} to ${prunedDom.length} elements to fit max_tokens_hint.`);
        }
    }

    const systemPrompt = `You are the J.A.R.V.I.S. browser task planner.

ABSOLUTE RULE — JSON ONLY:
You MUST ONLY return a valid JSON object. Do NOT include ANY explanation, reasoning, markdown code fences, sentences, or text outside the JSON object. Violations will cause a system crash.

CRITICAL: Map the element's "id" field to "jarvis_id" in your actions. NEVER use CSS selectors for jarvis_id.

${memoryContext}

Available DOM Elements (current viewport):
${domString}
${promptDocs}
NAVIGATION RULE: If user says "open [website]" or "go to [website]", ALWAYS use:
{ "action": "open_url", "url": "https://www.[site].com" }
Explicit mapping:
youtube -> https://www.youtube.com
google -> https://www.google.com

DO NOT interact with existing DOM for navigation tasks. NEVER type into the current page's search bar for navigation.

ANTI-HALLUCINATION RULE: If the user asks to click something NOT in the DOM elements list, do NOT guess a jarvis_id. Use "youtube_search" or "open_url" to find it first.

YOUTUBE SEARCH RULE: After using "youtube_search", you MUST click a video before using "media_control". Do NOT use "media_control" immediately after "youtube_search" without clicking first.

SECURITY RULE: Set "requires_confirmation": true if: youtube_comment, youtube_subscribe, youtube_like, type_secure are used, OR total steps > 3.
${getPlannerTimeContext()}

REQUIRED OUTPUT FORMAT — always exactly this structure, nothing else:
{
  "requires_confirmation": false,
  "internal_steps": ["Reasoning about available DOM elements...", "Determined jarvis_id 5 is correct"],
  "steps": [
    { "action": "click", "jarvis_id": 5 },
    { "action": "type", "jarvis_id": 12, "text": "Hello World" },
    { "action": "media_control", "command": "play" }
  ]
}`;

    const userPrompt = `User goal: "${goal}"\n\nCRITICAL: You MUST reply with ONLY a valid JSON object matching the EXACT "REQUIRED OUTPUT FORMAT" from the system instructions. Do NOT invent your own JSON keys or structure.`;

    try {
        const { parsed, tokens, model, provider } = await callPlannerLLM(systemPrompt, userPrompt);
        const actions: BrowserAction[] = parsed.steps || [];
        const requires_confirmation = parsed.requires_confirmation || false;
        const internal_steps: string[] = parsed.internal_steps || [];
        
        if (actions.length === 0) {
            logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: "I couldn’t generate actionable steps. Please give a short, clear command." })}`);
            return { actions: [], tokens: 0, requires_confirmation: false, internal_steps, errorFallback: "I couldn’t generate actionable steps. Please give a short, clear command.", model, provider };
        }
        
        logger.info("Planner", `planWithDOM done (${actions.length} steps, confirm: ${requires_confirmation})`);
        return { actions, tokens, requires_confirmation, internal_steps, model, provider };
    } catch (e: any) {
        logger.error("Planner", `planWithDOM failed: ${e.message}`);
        logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: `Planner failed: ${e.message}` })}`);
        return { actions: [], tokens: 0, requires_confirmation: false, internal_steps: [], errorFallback: e.message };
    }
}

// ── planWithVisualAgent (using Set-of-Mark Screenshot) ────────────────────────

export async function planWithVisualAgent(goal: string, imageBase64: string, elementsMap: any[]): Promise<{actions: BrowserAction[], tokens: number, requires_confirmation: boolean, internal_steps?: string[], errorFallback?: string, model?: string, provider?: string}> {
    const systemPrompt = `You are the J.A.R.V.I.S. Visual Browser Agent.

ABSOLUTE RULE — JSON ONLY:
You MUST ONLY return a valid JSON object. Do NOT include ANY explanation, reasoning, markdown code fences, sentences, or text outside the JSON object. Violations will cause a system crash.

You have been provided with a screenshot of the current browser tab.
Every interactive element on the screen has been marked with a red border and a red box containing an ID number.

Available actions you can output in the "steps" array:
- "click" (requires "jarvis_id": <number from the image>)
- "type" (requires "jarvis_id", "text")
- "type_secure" (requires "jarvis_id", "text") - use for passwords
- "scroll" (requires "direction": "up" or "down")
- "open_url" (requires "url")
- "youtube_search" (requires "query")
- "go_back"
- "wait" (requires "seconds")

CRITICAL RULES:
1. ONLY use "jarvis_id" numbers that you can clearly see in the screenshot.
2. If you need to search Google or YouTube, you can use "open_url" or "youtube_search" directly without clicking the search bar.
3. Keep your plans very short. Since the screen changes after every click, usually 1 or 2 steps is best.
${getPlannerTimeContext()}

REQUIRED OUTPUT FORMAT:
{
  "requires_confirmation": false,
  "internal_steps": ["I see the search button is box 14. I will click it."],
  "steps": [
    { "action": "click", "jarvis_id": 14 }
  ]
}`;

    const userPrompt = `User goal: "${goal}"\n\nCRITICAL: You MUST reply with ONLY a valid JSON object matching the EXACT "REQUIRED OUTPUT FORMAT" from the system instructions. Do NOT invent your own JSON keys or structure.`;

    try {
        // Use the new imageBase64 parameter we added to the LLM Router
        const { parsed, tokens, model, provider } = await callPlannerLLM(systemPrompt, userPrompt, imageBase64);
        
        // We still use BrowserAction format, but we will let the execution layer map jarvis_id to coordinates
        const actions: BrowserAction[] = parsed.steps || [];
        const requires_confirmation = parsed.requires_confirmation || false;
        const internal_steps: string[] = parsed.internal_steps || [];
        
        if (actions.length === 0) {
            logger.warn("VisualAgent", `Failed to generate actions. Model: ${provider}/${model}. Tokens: ${tokens}.`);
            return { actions: [], tokens: 0, requires_confirmation: false, internal_steps, errorFallback: "I couldn't generate actionable visual steps.", model, provider };
        }
        
        // --- Enhanced Debugging & Screenshot Saving ---
        if (imageBase64) {
            try {
                const logsDir = path.resolve(process.cwd(), 'logs', 'debug_screenshots');
                if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
                const fileName = `screenshot_${Date.now()}.png`;
                fs.promises.writeFile(path.join(logsDir, fileName), Buffer.from(imageBase64, 'base64'))
                    .then(() => logger.info("VisualAgent", `Saved debug screenshot to logs/debug_screenshots/${fileName}`))
                    .catch(err => logger.warn("VisualAgent", `Could not save debug screenshot: ${err}`));
            } catch (err) {
                logger.warn("VisualAgent", `Could not save debug screenshot: ${err}`);
            }
        }

        logger.info("VisualAgent", `SUCCESS | Model: ${provider}/${model} | Tokens: ${tokens} | Confirm: ${requires_confirmation}`);
        logger.info("VisualAgent", `Plan: ${JSON.stringify(actions)}`);
        
        return { actions, tokens, requires_confirmation, internal_steps, model, provider };
    } catch (e: any) {
        logger.error("Planner", `planWithVisualAgent failed: ${e.message}`);
        return { actions: [], tokens: 0, requires_confirmation: false, internal_steps: [], errorFallback: e.message };
    }
}
