import { getGroqClient } from '../llm';
import { BrowserAction, memory, tracker } from './executor';
import { logger } from '../logger';

// ── Shared hardened Planner LLM call ─────────────────────────────────────────
// Enforces JSON mode, validates output, retries ONCE on parse failure, and logs
// the raw planner response to debug.log for verification.
async function callPlannerLLM(systemPrompt: string): Promise<{ parsed: any; tokens: number }> {
    const groq = getGroqClient();
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: systemPrompt }],
            temperature: 0,
            // HARD API ENFORCEMENT: model is forced to only emit valid JSON tokens
            response_format: { type: "json_object" }
        });

        const rawOutput = response.choices[0]?.message?.content || '';
        const tokens = response.usage?.total_tokens || 0;

        // Log raw output to debug.log for every attempt
        logger.debug("Planner", `[Attempt ${attempt}/${MAX_ATTEMPTS}] Raw output: ${rawOutput}`);

        // Validation layer: never trust the model blindly
        try {
            const parsed = JSON.parse(rawOutput);

            // Structural validation: must have a 'steps' array
            if (!parsed || !Array.isArray(parsed.steps)) {
                throw new Error(`Missing 'steps' array. Got keys: [${Object.keys(parsed || {}).join(', ')}]`);
            }

            logger.info("Planner", `[Attempt ${attempt}] Valid plan (${parsed.steps.length} steps)`);
            return { parsed, tokens };

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

export async function createPlan(goal: string): Promise<{actions: BrowserAction[], tokens: number, requires_confirmation: boolean, internal_steps?: string[], errorFallback?: string}> {
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

${memoryContext}

SECURITY RULE: Set "requires_confirmation": true if actions include: youtube_comment, youtube_subscribe, youtube_like, type_secure, opening untrusted URLs, OR total steps > 3. Trusted domains: youtube.com, google.com, daraz.pk, facebook.com.

REQUIRED OUTPUT FORMAT — always exactly this structure, nothing else:
{
  "requires_confirmation": false,
  "internal_steps": ["Reasoning step 1", "Reasoning step 2"],
  "steps": [
    { "action": "open_url", "url": "https://example.com" },
    { "action": "click", "selector": "#login-btn" }
  ]
}

User goal: "${goal}"`;

    try {
        const { parsed, tokens } = await callPlannerLLM(systemPrompt);
        const actions: BrowserAction[] = parsed.steps || [];
        const requires_confirmation = parsed.requires_confirmation || false;
        const internal_steps: string[] = parsed.internal_steps || [];
        logger.info("Planner", `createPlan done (${actions.length} steps, confirm: ${requires_confirmation})`);
        return { actions, tokens, requires_confirmation, internal_steps };
    } catch (e: any) {
        logger.error("Planner", `createPlan failed: ${e.message}`);
        logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: `Planner failed: ${e.message}` })}`);
        return { actions: [], tokens: 0, requires_confirmation: false, internal_steps: [] };
    }
}

// ── planWithDOM (with DOM element context — used after page is analyzed) ──────

export async function planWithDOM(goal: string, domElements: any[]): Promise<{actions: BrowserAction[], tokens: number, requires_confirmation: boolean, internal_steps?: string[], errorFallback?: string}> {
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
- "youtube_like"
- "youtube_subscribe"
- "youtube_comment" (requires "text")
- "serp_api_search" (requires "query")
- "media_control" (requires "command": "play"|"pause"|"skip_forward"|"skip_backward")

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
        promptDocs = `Available actions (compact): open_url, open_tab, switch_tab, close_tab, close_browser, go_back, click, type, type_secure, scroll, youtube_search, youtube_like, youtube_subscribe, youtube_comment, serp_api_search, media_control.`;
        
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

User goal: "${goal}"
${memoryContext}

Available DOM Elements (current viewport):
${domString}
${promptDocs}
NAVIGATION RULE: If user asks to open a website, ALWAYS use "open_url" or "open_tab". NEVER type into the current page's search bar for navigation.

ANTI-HALLUCINATION RULE: If the user asks to click something NOT in the DOM elements list, do NOT guess a jarvis_id. Use "youtube_search" or "open_url" to find it first.

SECURITY RULE: Set "requires_confirmation": true if: youtube_comment, youtube_subscribe, youtube_like, type_secure are used, OR total steps > 3.

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

    try {
        const { parsed, tokens } = await callPlannerLLM(systemPrompt);
        const actions: BrowserAction[] = parsed.steps || [];
        const requires_confirmation = parsed.requires_confirmation || false;
        const internal_steps: string[] = parsed.internal_steps || [];
        
        if (actions.length === 0) {
            logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: "I couldn’t generate actionable steps. Please give a short, clear command." })}`);
            return { actions: [], tokens: 0, requires_confirmation: false, internal_steps, errorFallback: "I couldn’t generate actionable steps. Please give a short, clear command." };
        }
        
        logger.info("Planner", `planWithDOM done (${actions.length} steps, confirm: ${requires_confirmation})`);
        return { actions, tokens, requires_confirmation, internal_steps };
    } catch (e: any) {
        logger.error("Planner", `planWithDOM failed: ${e.message}`);
        logger.info("Planner", `ACTION RESULT: ${JSON.stringify({ success: false, action: "planner", target: null, details: `Planner failed: ${e.message}` })}`);
        return { actions: [], tokens: 0, requires_confirmation: false, internal_steps: [], errorFallback: e.message };
    }
}
