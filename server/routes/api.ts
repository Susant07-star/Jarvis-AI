import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getGroqClient, summarizeMemory, logTokenUsage, logFeedback, callWithRetry } from "../llm";
import { performSearch } from "../search";
import { saveToMemory, loadMemory, getSessionContextSummary, getMemoryStats } from "../memory";
import { jarvisTools } from "../tools";
import { buildPrompt } from "../agent_prompts/prompt_builder";
import { logInteraction, trackBrowserTask } from "../browser/jarvisBridge";
import { logger } from "../logger";
import { MetricsTracker } from "../utils/metrics";
import { getPendingConfirmation, setPendingPlanWithMetadata, clearPendingConfirmation, hasPendingConfirmation } from "../confirmationState";
import { callChatWithCascade, callResearchWithCascade } from "../llmRouter";
import { ThreadManager } from "../threadManager";
import { setTimezone, getTimezone } from "../timezoneStore";

import { renderLogPortalHtml, requireLogAccess, sendLogTail } from "../logPortal";

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Dedicated multer for voice files — preserves .wav extension so SpeechBrain can decode correctly
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, _file, cb) => {
      // Always save with .wav extension regardless of original filename
      cb(null, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
    },
  }),
});

// ── Shared config for frontend ──
router.get("/config/voice-prompt", async (req, res) => {
  try {
    const prompt = buildPrompt("voice");
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: "Failed to assemble voice prompt" });
  }
});

router.get("/config/keys", (req, res) => {
  res.json({ key: process.env.GEMINI_API_KEY || "" });
});

// ── Timezone Sync ──
router.get("/config/timezone", (req, res) => {
  res.json({ timezone: getTimezone() });
});

router.post("/config/timezone", (req, res) => {
  const { timezone } = req.body;
  if (!timezone) return res.status(400).json({ error: "Missing timezone" });
  setTimezone(timezone);
  res.json({ success: true, timezone: getTimezone() });
});

// ── Butler Queue (Async Background Tasks) ──
router.post("/butler/dispatch", async (req, res) => {
  try {
    const { type, query, chatId } = req.body;
    if (!type || !query) return res.status(400).json({ error: "Missing type or query" });

    const { butlerQueue } = await import("../butlerQueue");
    const taskId = butlerQueue.dispatch(type, query, chatId || 0);

    logger.info("API", `[Butler] Dispatched ${type} task: "${query}" → ${taskId}`);
    res.json({ success: true, taskId, status: "accepted" });
  } catch (error: any) {
    logger.error("API", "Butler dispatch error", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/butler/results", async (req, res) => {
  try {
    const { butlerQueue } = await import("../butlerQueue");
    const completed = butlerQueue.collectCompleted();
    res.json({ results: completed });
  } catch (error: any) {
    res.json({ results: [] });
  }
});

// Secure Remote Debugging Endpoint
router.get("/logs", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(renderLogPortalHtml("/api/logs/raw"));
});

router.get("/logs/raw", requireLogAccess, sendLogTail);
router.get("/session-context", async (req, res) => {
  try {
    const context = await getSessionContextSummary();
    res.json({ 
      hasPriorContext: !!context,
      context: context || "" 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch session context" });
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ── Voice Biometrics (Parallel Streaming endpoint) ──
router.post("/verify-voice-buffer", voiceUpload.single('audio_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const { verifyVoice } = await import("../voice_bridge");
    const result = await verifyVoice(req.file.path);
    
    // Clean up temporary file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json(result);
  } catch (err: any) {
    logger.error("API", `Voice buffer verification failed: ${err.message}`);
    // Cleanup on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: "Verification failed", speaker: "boss", confidence: 0.5 });
  }
});

// ── Enroll a new guest voice print ──
router.post("/enroll-voice", async (req, res) => {
  try {
    const { name, embedding_b64 } = req.body;
    if (!name || !embedding_b64) {
      return res.status(400).json({ success: false, error: "Missing name or embedding_b64" });
    }

    // Security: block attempts to register as the boss or generic unknown identities
    const forbidden = ["boss", "susant", "admin", "jarvis", "creator", "stranger", "unknown", "guest", "someone", "anonymous", "person"];
    if (forbidden.some(f => name.toLowerCase().includes(f))) {
      return res.status(403).json({ success: false, error: "Invalid or reserved name. Please provide a real human name." });
    }

    const { supabase } = await import("../supabaseClient");
    if (!supabase) {
      return res.status(503).json({ success: false, error: "Supabase not configured" });
    }

    const { error } = await supabase.from("voice_profiles").insert({ name, embedding_b64 });
    if (error) {
      logger.error("API", `Voice enrollment failed for "${name}": ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    logger.info("API", `✅ Voice profile enrolled for: ${name}`);
    res.json({ success: true, name });
  } catch (err: any) {
    logger.error("API", `Enroll-voice error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Update an existing guest voice name ──
router.post("/update-guest-name", async (req, res) => {
  try {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
      return res.status(400).json({ success: false, error: "Missing old_name or new_name" });
    }

    // Security: block attempts to register as the boss or generic unknown identities
    const forbidden = ["boss", "susant", "admin", "jarvis", "creator", "stranger", "unknown", "guest", "someone", "anonymous", "person"];
    if (forbidden.some(f => new_name.toLowerCase().includes(f))) {
      return res.status(403).json({ success: false, error: "Invalid or reserved name. Please provide a real human name." });
    }

    const { supabase } = await import("../supabaseClient");
    if (!supabase) {
      return res.status(503).json({ success: false, error: "Supabase not configured" });
    }

    const { error } = await supabase
      .from("voice_profiles")
      .update({ name: new_name })
      .eq("name", old_name);

    if (error) {
      logger.error("API", `Voice name update failed for "${old_name}" to "${new_name}": ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    logger.info("API", `✅ Voice profile name updated from ${old_name} to ${new_name}`);
    res.json({ success: true, old_name, new_name });
  } catch (err: any) {
    logger.error("API", `Update guest name error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Knowledge Base Routes (for Zoya UI to access KnowledgeManager) ──
router.post("/knowledge/save", async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, error: "Missing title or content" });
    const { KnowledgeManager } = await import("../knowledgeManager");
    const success = await KnowledgeManager.saveKnowledge(title, content, tags || []);
    res.json({ success });
  } catch (err: any) {
    logger.error("API", `Knowledge save error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/knowledge/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "Missing query" });
    const { KnowledgeManager } = await import("../knowledgeManager");
    const results = await KnowledgeManager.searchKnowledge(query);
    res.json({ success: true, results });
  } catch (err: any) {
    logger.error("API", `Knowledge search error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});
    logger.error("API", `Update-guest-name error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Handle text-based chat interactions.
 */
router.post("/zoya-execute", async (req, res) => {
  let metrics: MetricsTracker | null = null;
  try {
    const { intent } = req.body;
    metrics = new MetricsTracker(intent || "voice_turn");
    metrics.setMode("voice_agent");
    metrics.setIntent("task");
    
    if (!intent) return res.status(400).json({ success: false, error: "Missing intent" });

    logger.info("API", `[Zoya Execute] Received intent: ${intent}`);
    
    const { determineOrchestrationMode } = await import("../orchestrator");
    const decision = await determineOrchestrationMode(intent);

    if (decision.mode === "direct") {
      return res.json({ success: true, result: "This was a conversational request. No action taken in browser." });
    }

    // Must be agent mode
    const { planWithVisualAgent } = await import("../browser/planner");
    
    // Get Marked Screenshot if available
    let base64Image = "";
    let elementsMap = [];
    if (process.env.USE_BROWSER_AGENT === "true") {
      try {
        const pythonRes = await fetch('http://127.0.0.1:8000/mark-page', { 
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }
        });
        const markData = await pythonRes.json();
        if (markData.status === "success") {
          base64Image = markData.image;
          elementsMap = markData.elements || [];
        }
      } catch(e) {
        logger.warn("API", "Could not fetch marked screenshot for Zoya execute");
      }
    }

    let plannerResult;
    if (base64Image) {
      plannerResult = await planWithVisualAgent(decision.normalizedInput || intent, base64Image, elementsMap);
    } else {
      const { createPlan } = await import("../browser/planner");
      plannerResult = await createPlan(decision.normalizedInput || intent);
    }
    const { actions: plannedSteps, tokens: plannerTokens, errorFallback, model, provider } = plannerResult as any;

    if (metrics) {
      metrics.addTokens('planner', plannerTokens || 0);
      metrics.setPlannerOutput(plannedSteps);
    }

    if (!plannedSteps || plannedSteps.length === 0) {
      return res.json({ success: false, error: errorFallback || "Could not formulate a valid plan." });
    }

// Execute Node/System actions
    const nodeActions = plannedSteps.filter((s:any) => s.action === 'serp_api_search' || s.action === 'schedule_call' || s.action === 'schedule_message');
    let searchResult = "";
    for (const na of nodeActions) {
       if (na.action === 'serp_api_search') {
            logger.info("Node", `Executing SerpAPI search for: ${na.query}`);
            const groq = getGroqClient();
            const summary = await performSearch(na.query, groq);
            searchResult += `Search results for "${na.query}":\n${summary}\n`;
       } else if (na.action === 'schedule_call' || na.action === 'schedule_message') {
            const { jarvisScheduler } = await import("../scheduler");
            const threadId = req.body.thread_id || "";
            const chatIdMatch = threadId.match(/tg_(\d+)/);
            const chatId = chatIdMatch ? parseInt(chatIdMatch[1]) : 0;
            
            const taskId = jarvisScheduler.schedule(chatId, na.action === 'schedule_call' ? 'call' : 'message', na.reason || na.text || "Scheduled task", na.delay_seconds || 0);
            logger.info("API", `[TOOL] Scheduler registered: ${na.action} (TaskID: ${taskId}) in ${na.delay_seconds}s`);
            searchResult += `[Scheduler] Action scheduled (TaskID: ${taskId}) for ${na.delay_seconds}s from now.\n`;
       }
    }

    // I.R.I.S. Router - Convert open_url/open_tab actions to I.R.I.S. commands
    const { transformStepsToIRIS } = await import("../irisIntentRouter");
    const { transformed: routedSteps, originalCount, transformedCount } = transformStepsToIRIS(plannedSteps);
    
    if (transformedCount > 0) {
      logger.info("API", `[I.R.I.S. Router] Converted ${transformedCount}/${originalCount} steps to I.R.I.S. commands for voice agent`);
    }

    // Execute via Python Layer (browser actions that weren't converted)
    const browserActions = routedSteps.filter((s:any) => s.action !== 'open_app' && s.action !== 'serp_api_search');
    const irisActions = routedSteps.filter((s:any) => s.action === 'open_app');
    
    // Execute I.R.I.S. actions
    if (irisActions.length > 0) {
      logger.info("API", `[Zoya Execute] Executing ${irisActions.length} actions via I.R.I.S.`);
      for (const ia of irisActions) {
        try {
          const { executeOnIris } = await import("../irisExecutor");
          const irisResult = await executeOnIris(ia.action, ia.payload);
          logger.info("API", `[I.R.I.S.] Action ${ia.action} result: ${irisResult.success ? 'SUCCESS' : 'FAILED'} - ${irisResult.message}`);
          searchResult += `[I.R.I.S.] ${irisResult.message}\n`;
        } catch (e: any) {
          logger.error('API', `I.R.I.S. action failed: ${e.message}`);
          searchResult += `[I.R.I.S. Error] ${e.message}\n`;
        }
      }
    }
    
    if (browserActions.length > 0) {
      if (process.env.USE_BROWSER_AGENT !== "true") {
          return res.json({ success: false, error: "Browser execution is disabled on the cloud.", suggestion: "Cannot run browser tasks right now." });
      }
      try {
          const pythonRes = await fetch('http://127.0.0.1:8000/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: browserActions })
          });
          const pythonData = await pythonRes.json();
          const failures = pythonData.results?.filter((r: any) => r.status === 'failure') || [];
          
          if (failures.length > 0) {
              const errors = failures.map((r: any) => `${r.action}: ${r.details}`).join(', ');
              return res.json({ 
                success: false, 
                error: `Browser execution failed: ${errors}`,
                suggestion: "Please try a different approach or verify the element exists."
              });
          }
      } catch (e: any) {
          logger.error('API', `Python agent failed: ${e.message}`);
          return res.json({ success: false, error: `Agent unreachable: ${e.message}` });
      }
    }

    if (metrics) {
      metrics.setExecutionResult("Success");
      metrics.finalize();
    }
    const finalResult = searchResult ? `Browser actions executed. ${searchResult}` : "Browser actions executed successfully.";
    res.json({ success: true, result: finalResult, metadata: { model, provider } });

  } catch (error: any) {
    logger.error("API", "Zoya Execute Error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Handle text-based chat interactions.
 */
router.post("/chat", async (req, res) => {
  let metrics: MetricsTracker | null = null;
  try {
    const { message } = req.body;
    metrics = new MetricsTracker(message);
    
    // 0. Confirmation handling is now centralized in orchestrator.ts
    // The orchestrator will check confirmation state and return confirmationResult if handled
    
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured. Please add it to your secrets." });
    }

    const groq = getGroqClient();
    
    // 1. Orchestration routing
    const { determineOrchestrationMode } = await import("../orchestrator");
    const decision = await determineOrchestrationMode(message);
    if (metrics) {
      metrics.setIntent(decision.intent);
      metrics.setMode(decision.mode);
      if (decision.tokens) metrics.addTokens('classifier', decision.tokens);
    }
    logger.info("API", `Orchestrator Decision: ${JSON.stringify(decision)}`);

    // Handle confirmation result from orchestrator
    if (decision.confirmationResult) {
      const { type, plan, message: confirmationMessage } = decision.confirmationResult;
      
      if (type === 'confirmed' && plan) {
        // Execute the stored plan
        logger.info("API", `Executing confirmed plan: ${plan.goal}`);
        
        const browserActions = plan.actions.filter((s:any) => s.action !== 'serp_api_search');
        
        if (browserActions.length > 0) {
          if (process.env.USE_BROWSER_AGENT !== "true") {
             throw new Error("Browser agent is disabled on the cloud.");
          }
          try {
            const response = await fetch('http://127.0.0.1:8000/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commands: browserActions })
            });
            logger.info('API', `Python executor returned: ${response.status}`);
            
            const pythonData = await response.json();
            const hasFailure = pythonData.results && Array.isArray(pythonData.results) && pythonData.results.some((r: any) => r.status === 'failure');
            if (hasFailure) {
                const errors = pythonData.results.filter((r: any) => r.status === 'failure').map((r: any) => `${r.action}: ${r.details}`).join(', ');
                throw new Error(`Browser execution failed: ${errors}`);
            }
          } catch (e: any) {
            logger.error('API', `Python agent unreachable or failed: ${e.message}`);
            const failReply = `❌ Execution failed: ${e.message}`;
            saveToMemory('user', message);
            saveToMemory('jarvis', failReply);
            logInteraction('chat', plan.goal, failReply);
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ content: failReply })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            if (metrics) { metrics.setExecutionResult('Failure via confirmation'); metrics.finalize(); }
            return res.end();
          }
        }
        
        const successReply = confirmationMessage || `Confirmed task executed.`;
        saveToMemory('user', message);
        saveToMemory('jarvis', successReply);
        logInteraction('chat', plan.goal, successReply, { browserCommands: plan.actions });
        trackBrowserTask('chat', plan.goal, plan.actions);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ content: successReply })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        
        if (metrics) {
          metrics.setExecutionResult('Success via confirmation');
          metrics.finalize();
        }
        return res.end();
      } else if (type === 'cancelled') {
        const cancelReply = confirmationMessage || "Action cancelled.";
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ content: cancelReply })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        if (metrics) {
          metrics.setExecutionResult('Cancelled by user');
          metrics.finalize();
        }
        return res.end();
      } else if (type === 'ambiguous') {
        const reprompt = confirmationMessage || "Please confirm the previous task (yes/no)";
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ content: reprompt })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        return res.end();
      }
      // For 'new_command', fall through to normal processing
    }

    if (decision.mode === "direct") {
      // Intercept direct scheduling intents to parse and execute natively without latency
      if (decision.intent === "schedule") {
        const { jarvisScheduler } = await import("../scheduler");
        const targetChatId = jarvisScheduler.getAdminChatId() || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");
        
        const scheduleResult = await jarvisScheduler.parseAndSchedule(message, targetChatId);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        res.write(`data: ${JSON.stringify({ content: scheduleResult.message })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        
        if (metrics) {
          metrics.setExecutionResult(`Schedule success: ${scheduleResult.taskId || 'unknown'}`);
          metrics.finalize();
        }
        return res.end();
      }

      // Direct Conversational Mode using Cascading Brains
      const { jarvisScheduler } = await import("../scheduler");
      const adminChatId = jarvisScheduler.getAdminChatId();
      const threadId = adminChatId ? `tg_${adminChatId}` : (req.body.thread_id || "default_chat");
      const history = await ThreadManager.getHistory(threadId, 20);
      
      const systemPrompt = buildPrompt("voice"); 

      // ── Semantic Memory Recall ─────────────────────────────────────────────
      // Search vector DB for past conversations relevant to this message.
      // Each match includes its exact timestamp so Jarvis can cite when it happened.
      const relevantMemories = await ThreadManager.searchMemory(message, 3);
      const memoryBlock = relevantMemories.length > 0
        ? `\n\n### 🧠 RELEVANT PAST CONVERSATIONS (with exact timestamps):\n${relevantMemories.join('\n')}\n\nUse these timestamps to answer questions like "when did we talk about X?" accurately.`
        : "";

      const messages = [
        { role: "system", content: systemPrompt + memoryBlock },
        ...history,
        { role: "user", content: message }
      ];

      let result = await callChatWithCascade(messages as any);

      // ── Universal Tool Handler (Agentic Loop) ─────────────────────────────
      // We intercept any JSON tool call, dispatch it, and narrate the result.
      if (result.content.includes('"tool"')) {
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
          const rawJson = jsonMatch ? jsonMatch[0] : result.content;
          const toolCall = JSON.parse(rawJson);
          
          let toolSuccess = false;
          let toolMessage = "";
          let executed = false;
          let visionFramesForNextCall: string[] | undefined = undefined;

if (toolCall.tool === 'execute_local_os_command') {
             const { executeOnIrisWithVerification } = await import('../irisExecutor');
             const parsedPayload = typeof toolCall.payload === 'string' ? JSON.parse(toolCall.payload) : (toolCall.payload || {});
             const irisResult = await executeOnIrisWithVerification(toolCall.action, parsedPayload);
             toolSuccess = irisResult.success;
             toolMessage = irisResult.message;
             // Include verification data if available
             if (irisResult.verification?.screenshotTaken) {
               toolMessage += "\n[Verified via screenshot]";
             }
             executed = true;
          } else if (toolCall.tool === 'saveFile') {
            toolSuccess = true;
            toolMessage = "File saved successfully to the frontend panel.";
            // Fire an event to UI via websocket or rely on the final response
            executed = true;
          } else if (toolCall.tool === 'look_at_screen') {
            const { getVisionBuffer } = await import('../irisExecutor');
            const visionFrames = await getVisionBuffer();
            if (visionFrames && visionFrames.length > 0) {
              visionFramesForNextCall = visionFrames;
              toolSuccess = true;
              toolMessage = `I.R.I.S Photographic Memory buffer successfully attached to your visual cortex. Describe what you see, or verify if the action was successful.`;
              executed = true;
            } else {
              toolSuccess = false;
              toolMessage = "Failed to fetch frames or I.R.I.S is offline. Cannot see the screen.";
              executed = true;
            }
          } else if (toolCall.tool === 'send_telegram_message') {
            // Send directly via the backend scheduler — works even when I.R.I.S. is offline
            try {
              const { jarvisScheduler } = await import('../scheduler');
              const targetChatId = jarvisScheduler.getAdminChatId() || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || '0');
              const msgText = toolCall.text || toolCall.message || '';
              if (targetChatId && msgText) {
                jarvisScheduler.schedule(targetChatId, 'message', msgText, 0);
                toolSuccess = true;
                toolMessage = `Telegram message sent to Boss (ChatID: ${targetChatId}): "${msgText}"`;
              } else {
                toolSuccess = false;
                toolMessage = `Could not send Telegram message: ${!targetChatId ? 'No Chat ID available.' : 'Empty message text.'}`;
              }
            } catch (e: any) {
              toolSuccess = false;
              toolMessage = `Telegram send error: ${e.message}`;
            }
            executed = true;
          }

          if (executed) {
            messages.push({ role: "assistant", content: result.content });
            const sysResultMsg = `[SYSTEM - TOOL RESULT]\nSuccess: ${toolSuccess}\nMessage/Output:\n${toolMessage}\n\nPlease summarize this result naturally for the user.`;
            messages.push({ role: "user", content: sysResultMsg });
            
            const finalResult = await callChatWithCascade(messages as any, visionFramesForNextCall);
            const spokenReply = finalResult.content;

            // Persist the ENTIRE agentic loop to memory (Total Awareness)
            await ThreadManager.appendMessage(threadId, { role: 'user', content: message });
            await ThreadManager.appendMessage(threadId, { role: 'assistant', content: result.content });
            await ThreadManager.appendMessage(threadId, { role: 'user', content: sysResultMsg });
            await ThreadManager.appendMessage(threadId, { role: 'assistant', content: spokenReply });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write(`data: ${JSON.stringify({ metadata: { model: finalResult.model, provider: finalResult.provider, iris_action: toolCall.tool } })}\n\n`);
            res.write(`data: ${JSON.stringify({ content: spokenReply })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            if (metrics) { metrics.setExecutionResult(`Tool ${toolCall.tool}: ${toolSuccess ? 'OK' : 'FAIL'}`); metrics.finalize(); }
            return res.end();
          }
        } catch (err: any) {
          logger.error("API", `[Tool Uplink Error] Failed to parse or execute tool call. Error: ${err.message}`, err);
          logger.debug("API", `[Tool Uplink Error] Raw content was: ${result.content}`);
          // Fall through to normal streaming if JSON parse failed
        }
      }
      // ── End Universal Tool Handler ─────────────────────────────────────────

      // Save to persistent thread memory
      await ThreadManager.appendMessage(threadId, { role: "user", content: message });
      await ThreadManager.appendMessage(threadId, { role: "assistant", content: result.content });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send model metadata first
      res.write(`data: ${JSON.stringify({ metadata: { model: result.model, provider: result.provider, tokens: result.tokens } })}\n\n`);

      const words = result.content.split(' ');
      for (let i = 0; i < words.length; i++) {
        res.write(`data: ${JSON.stringify({ content: words[i] + (i === words.length - 1 ? "" : " ") })}\n\n`);
        if (words.length > 50 && i % 5 === 0) await new Promise(r => setTimeout(r, 10));
      }
      
      logInteraction('chat', message, result.content);
      
      if (metrics) {
        metrics.addTokens('direct', result.tokens || 0);
        metrics.setExecutionResult(`Chat via ${result.model}`);
        metrics.finalize();
      }
      
      res.write(`data: [DONE]\n\n`);
      return res.end();
    } else {
      // Agent Task Mode (Strict Planning -> Execution)
      const { planWithVisualAgent } = await import("../browser/planner");
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // A. Extract Marked Screenshot
      let base64Image = "";
      let elementsMap = [];
      if (process.env.USE_BROWSER_AGENT === "true") {
        try {
          const pythonRes = await fetch('http://127.0.0.1:8000/mark-page', { 
              method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }
          });
          const markData = await pythonRes.json();
          if (markData.status === "success") {
            base64Image = markData.image;
            elementsMap = markData.elements || [];
          }
        } catch(e) {
          logger.warn("API", "Could not fetch marked screenshot, running blind planner");
        }
      }

      // Use normalized input to eliminate LLM confusion over chatty sentences
      const goal = decision?.normalizedInput || message;
      logger.info('API', `Planning goal: "${goal}"`);

      if (decision?.normalizedInput && decision.normalizedInput !== message) {
        res.write(`data: ${JSON.stringify({ content: `*[Normalized Goal: ${goal}]*\n\n` })}\n\n`);
      }

      // B. Create Strict JSON Plan
      let plannerResult;
      if (base64Image) {
        plannerResult = await planWithVisualAgent(goal, base64Image, elementsMap);
      } else {
        const { createPlan } = await import("../browser/planner");
        plannerResult = await createPlan(goal);
      }
      const { actions: plannedSteps, tokens: plannerTokens, requires_confirmation, errorFallback, internal_steps, model, provider } = plannerResult as any;
      
      // Send model metadata
      res.write(`data: ${JSON.stringify({ metadata: { model, provider, tokens: plannerTokens } })}\n\n`);

      if (internal_steps && internal_steps.length > 0) {
        res.write(`data: ${JSON.stringify({ thoughts: internal_steps })}\n\n`);
      }
      
      if (metrics) {
        metrics.addTokens('planner', plannerTokens);
        metrics.setPlannerOutput(plannedSteps);
      }
      
      logger.info("API", `Planner output: ${JSON.stringify(plannedSteps)}`);

      if (!plannedSteps || plannedSteps.length === 0) {
        const errReply = errorFallback || "I could not formulate a valid plan for this goal.";
        saveToMemory('jarvis', errReply);
        logInteraction('chat', goal, errReply);
        res.write(`data: ${JSON.stringify({ content: "\n" + errReply })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        if (metrics) {
          metrics.setExecutionResult(errReply);
          metrics.finalize();
        }
        return res.end();
      }

      // C. Confirmation Gateway
      if (requires_confirmation) {
        setPendingPlanWithMetadata(plannedSteps, goal, 'api');
        const confirmMsg = `\n⚠️ I am about to navigate to an untrusted website or perform a sensitive action. Should I proceed? (yes/no)`;
        saveToMemory('jarvis', confirmMsg);
        logInteraction('chat', message, confirmMsg);
        res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        if (metrics) {
            metrics.setExecutionResult('Pending Confirmation');
            metrics.finalize();
        }
        return res.end();
      }

      // C2. I.R.I.S. Router - Convert website navigation to I.R.I.S. actions
      const { transformStepsToIRIS } = await import("../irisIntentRouter");
      const { transformed: routedSteps, originalCount, transformedCount } = transformStepsToIRIS(plannedSteps);
      
      if (transformedCount > 0) {
        logger.info("API", `[I.R.I.S. Router] Converted ${transformedCount}/${originalCount} steps to I.R.I.S. commands`);
        res.write(`data: ${JSON.stringify({ content: `\n[Routed ${transformedCount} actions to I.R.I.S. for system control]\n\n` })}\n\n`);
      }
      
      // D. Node Action Execution (SerpAPI, Scheduler)
      const nodeActions = routedSteps.filter((s:any) => s.action === 'serp_api_search' || s.action === 'schedule_call' || s.action === 'schedule_message');
      const irisActions = routedSteps.filter((s:any) => s.action === 'open_app');
      const browserActions = routedSteps.filter((s:any) => !['serp_api_search', 'schedule_call', 'schedule_message', 'open_app'].includes(s.action));

      for (const na of nodeActions) {
         if (na.action === 'serp_api_search') {
            logger.info("Node", `Executing SerpAPI search for: ${na.query}`);
            res.write(`data: ${JSON.stringify({ content: `\n[SerpAPI] Searching for: ${na.query}...` })}\n\n`);
            const groq = getGroqClient();
            const summary = await performSearch(na.query, groq);
            res.write(`data: ${JSON.stringify({ content: `\n\n*Search Results:*\n${summary}\n\n` })}\n\n`);
         } else if (na.action === 'schedule_call' || na.action === 'schedule_message') {
            const { jarvisScheduler } = await import("../scheduler");
            const threadId = req.body.thread_id || "";
            const chatIdMatch = threadId.match(/tg_(\d+)/);
            const chatId = chatIdMatch ? parseInt(chatIdMatch[1]) : 0;
            
            jarvisScheduler.schedule(chatId, na.action === 'schedule_call' ? 'call' : 'message', na.reason || na.text || "Scheduled task", na.delay_seconds || 0);
            res.write(`data: ${JSON.stringify({ content: `\n[Scheduler] Action scheduled for ${na.delay_seconds} seconds from now.` })}\n\n`);
         }
         
         if (metrics) metrics.addTokens('planner', 50); 
      }

      // E1. Execute I.R.I.S. Actions (converted from open_url/open_tab)
      if (irisActions.length > 0) {
        logger.info("API", `[I.R.I.S. Executor] Executing ${irisActions.length} actions via I.R.I.S.`);
        for (const ia of irisActions) {
          try {
            const { executeOnIris } = await import("../irisExecutor");
            const irisResult = await executeOnIris(ia.action, ia.payload);
            res.write(`data: ${JSON.stringify({ content: `\n[I.R.I.S.] ${irisResult.message}` })}\n\n`);
            logger.info("API", `[I.R.I.S.] Action ${ia.action} result: ${irisResult.success ? 'SUCCESS' : 'FAILED'}`);
          } catch (e: any) {
            logger.error('API', `I.R.I.S. action failed: ${e.message}`);
            res.write(`data: ${JSON.stringify({ content: `\n[I.R.I.S. Error] ${e.message}` })}\n\n`);
          }
        }
      }

      // E. Execute via Python Layer (actual browser actions)
      if (browserActions.length > 0) {
        if (process.env.USE_BROWSER_AGENT !== "true") {
             logger.info("API", "Browser agent is disabled. Falling back to direct conversational response.");
             
             const threadId = req.body.thread_id || "default_chat";
             const history = await ThreadManager.getHistory(threadId, 20);
             const systemPrompt = buildPrompt("voice"); 
             const messages = [
               { role: "system", content: systemPrompt },
               ...history,
               { role: "user", content: message }
             ];

             const result = await callChatWithCascade(messages as any);

             // Save to persistent thread memory
             await ThreadManager.appendMessage(threadId, { role: "user", content: message });
             await ThreadManager.appendMessage(threadId, { role: "assistant", content: result.content });

             // Send model metadata first
             res.write(`data: ${JSON.stringify({ metadata: { model: result.model, provider: result.provider, tokens: result.tokens } })}\n\n`);

             // Send helpful fallback message notice
             const fallbackNotice = `*(Notice: Browser automation is currently offline/disabled. Here is an answer based on my general knowledge)*\n\n`;
             res.write(`data: ${JSON.stringify({ content: fallbackNotice })}\n\n`);

             // Stream reply with realistic typing flow
             const words = result.content.split(' ');
             for (const w of words) {
               res.write(`data: ${JSON.stringify({ content: w + ' ' })}\n\n`);
               await new Promise(r => setTimeout(r, 12));
             }
             res.write(`data: [DONE]\n\n`);

             if (metrics) {
               metrics.setExecutionResult('Success (Direct Fallback)');
               metrics.finalize();
             }
             return res.end();
        }
        try {
            const pythonRes = await fetch('http://127.0.0.1:8000/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commands: browserActions })
            });
            logger.info("API", `Python executor returned: ${pythonRes.status}`);
            
            const pythonData = await pythonRes.json();
            const hasFailure = pythonData.results && Array.isArray(pythonData.results) && pythonData.results.some((r: any) => r.status === 'failure');
            if (hasFailure) {
                const errors = pythonData.results.filter((r: any) => r.status === 'failure').map((r: any) => `${r.action}: ${r.details}`).join(', ');
                throw new Error(`Browser execution failed: ${errors}`);
            }
        } catch (e: any) {
            logger.error('API', `Python agent unreachable or failed: ${e.message}`);
            const failReply = `\n❌ Execution failed: ${e.message}`;
            saveToMemory('user', message);
            saveToMemory('jarvis', failReply);
            logInteraction('chat', goal, failReply);
            res.write(`data: ${JSON.stringify({ content: failReply })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            if (metrics) { metrics.setExecutionResult('Failure'); metrics.finalize(); }
            return res.end();
        }
      }
      
      const successReply = `\n✅ I have executed your instructions.`;
      saveToMemory('user', message);
      saveToMemory('jarvis', successReply);
      logInteraction('chat', message, successReply, { browserCommands: plannedSteps });
      trackBrowserTask('chat', message, plannedSteps);

      res.write(`data: ${JSON.stringify({ content: successReply })}\n\n`);
      // Send browser commands event structure matching existing UI
      res.write(`data: ${JSON.stringify({ browser_commands: plannedSteps })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      if (metrics) {
        metrics.setExecutionResult('Success');
        metrics.finalize();
      }
      return res.end();
    }

  } catch (error: any) {
    logger.error("API", "Chat API Error", error);
    if (metrics) {
      metrics.setExecutionResult(`Error: ${error.message}`);
      metrics.finalize();
    }
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to process request" });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * Handle audio transcription requests (fallback for non-WebSocket clients).
 */
router.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided." });
    }

    // Rename file to have the correct extension so Groq accepts it
    const ext = path.extname(req.file.originalname) || '.webm';
    const newPath = req.file.path + ext;
    fs.renameSync(req.file.path, newPath);

    const groq = getGroqClient();
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: "whisper-large-v3",
    });

    // Clean up the file
    fs.unlinkSync(newPath);

    res.json({ text: transcription.text });
  } catch (error: any) {
    console.error("[Transcribe API Error]", error);
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.webm';
      const newPath = req.file.path + ext;
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || "Failed to process audio" });
  }
});

/**
 * Browser status — queries the Python agent for live tab state.
 * Called on UI load so JARVIS can greet with context about what's open.
 * Never initializes the browser; returns { alive: false } if not running.
 */
router.get("/browser-status", async (_req, res) => {
  if (process.env.USE_BROWSER_AGENT !== "true") {
    return res.json({ alive: false, tabs: [] });
  }
  try {
    const response = await fetch('http://127.0.0.1:8000/browser-status');
    if (!response.ok) {
      return res.json({ alive: false, tabs: [] });
    }
    const data = await response.json();
    res.json(data);
  } catch {
    // Python agent is not running or unreachable — this is expected on cold start
    res.json({ alive: false, tabs: [] });
  }
});

/**
 * POST /api/memory/sync
 * Allows frontend services (like Zoya Voice) to sync messages back to the server memory.
 */
router.post("/memory/sync", (req, res) => {
  try {
    const { role, content } = req.body;
    if (role && content) {
      saveToMemory(role, content);
      
      const metrics = new MetricsTracker(content);
      metrics.setIntent("sync");
      metrics.setMode("voice_sync");
      // Estimate 1 token per 4 chars for the synced text
      metrics.addTokens('voice', Math.ceil(content.length / 4));
      metrics.finalize();

      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Missing role or content" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/memory/stats
 * Returns statistics about the current session memory.
 */
router.get("/memory/stats", (_req, res) => {
  res.json(getMemoryStats());
});

/**
 * Log user feedback securely to the backend CSV file
 */
router.post("/feedback", async (req, res) => {
  try {
    const { messageId, query, response, isPositive, comment } = req.body;
    logFeedback(messageId, query || '', response || '', !!isPositive, comment || '');
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Feedback API Error]", error);
    res.status(500).json({ error: error.message || "Failed to log feedback" });
  }
});

/**
 * GET /api/session-context
 * Returns a compact, token-efficient summary of recent conversation history.
 * Consumed by Zoya voice service at session start to inject shared memory.
 */
/**
 * POST /api/intelligent-search
 * Dedicated high-precision research endpoint for Zoya.
 * Uses Gemini 2.5 with Google Search grounding.
 */
router.post("/intelligent-search", async (req, res) => {
  let metrics: MetricsTracker | null = null;
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query" });

    metrics = new MetricsTracker(query);
    metrics.setMode("research");
    metrics.setIntent("deep_search");

    logger.info("API", `[Research] Performing deep search for: "${query}"`);
    
    const answer = await callResearchWithCascade(query);
    
    if (metrics) {
      metrics.setExecutionResult("Success");
      metrics.finalize();
    }

    res.json({ success: true, answer });
  } catch (error: any) {
    logger.error("API", "Intelligent Search Error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/scheduler/register
 * Allows frontend voice sessions to register background timers via J.A.R.V.I.S.
 */
router.post("/scheduler/register", async (req, res) => {
  try {
    const { type, content, delay_seconds, chatId } = req.body;
    if (!type || delay_seconds === undefined) {
      return res.status(400).json({ error: "Missing type or delay_seconds" });
    }
    
    // Fallback to 0 if no chatId is provided by the frontend session
    const targetChatId = chatId || 0; 
    
    const { jarvisScheduler } = await import("../scheduler");
    const taskId = jarvisScheduler.schedule(targetChatId, type, content || "Scheduled Voice Action", delay_seconds);
    
    res.json({ success: true, taskId });
  } catch (error: any) {
    logger.error("API", "Scheduler Registration Error", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alarm/ack
 * Allows the MacroDroid phone app or dynamic curls to acknowledge wake up, disarming active sleep watchdogs.
 */
router.post("/alarm/ack", async (req, res) => {
  try {
    const { chatId } = req.body;
    const { jarvisScheduler } = await import("../scheduler");
    
    const targetChatId = chatId || jarvisScheduler.getAdminChatId();
    if (!targetChatId || targetChatId === 0) {
      return res.status(400).json({ error: "No active Telegram Chat ID resolved." });
    }
    
    await jarvisScheduler.ackAlarm(targetChatId);
    res.json({ success: true, message: "Omega Alarm watchdog successfully cleared." });
  } catch (err: any) {
    logger.error("API", "Alarm ACK Error", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET/POST /api/config/macrodroid
 * Exposes dynamic configuration for MacroDroid triggers.
 */
router.get("/config/macrodroid", async (req, res) => {
  try {
    const { jarvisScheduler } = await import("../scheduler");
    res.json({ webhookUrl: jarvisScheduler.getMacrodroidUrl() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/config/macrodroid", async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ error: "Missing webhookUrl" });
    
    const { jarvisScheduler } = await import("../scheduler");
    jarvisScheduler.setMacrodroidUrl(webhookUrl);
    res.json({ success: true, webhookUrl: jarvisScheduler.getMacrodroidUrl() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks
 * Returns all currently active (pending) scheduled tasks for the sidebar Task Monitor.
 */
router.get("/tasks", async (req, res) => {
  try {
    const { jarvisScheduler } = await import("../scheduler");
    const chatId = jarvisScheduler.getAdminChatId();
    // Return ALL tasks regardless of chatId (0 = local/voice tasks are included)
    const allTasks = Array.from((jarvisScheduler as any).tasks?.values?.() || []);
    const tasks = allTasks.map((t: any) => ({
      id: t.id,
      type: t.type,
      content: t.content,
      executionTime: t.executionTime,
      chatId: t.chatId,
      secondsRemaining: Math.max(0, Math.round((t.executionTime - Date.now()) / 1000)),
    }));
    res.json({ tasks });
  } catch (err: any) {
    logger.error("API", "GET /tasks error", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/tasks/:id
 * Cancels and removes a specific scheduled task by ID.
 */
router.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { jarvisScheduler } = await import("../scheduler");
    const cancelled = jarvisScheduler.cancelTask(id);
    if (!cancelled) {
      return res.status(404).json({ success: false, error: "Task not found or already executed." });
    }
    logger.info("API", `[TaskMonitor] Task ${id} cancelled via UI.`);
    res.json({ success: true, message: `Task ${id} cancelled.` });
  } catch (err: any) {
    logger.error("API", "DELETE /tasks/:id error", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tasks/:id
 * Modifies an existing task: cancels the old one and schedules a new one.
 * Body: { type, content, delay_seconds }
 */
router.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, content, delay_seconds } = req.body;
    if (!type || !content || delay_seconds === undefined) {
      return res.status(400).json({ error: "Missing type, content, or delay_seconds" });
    }
    const { jarvisScheduler } = await import("../scheduler");
    // Get chatId of original task before cancelling
    const allTasks: any[] = Array.from((jarvisScheduler as any).tasks?.values?.() || []);
    const original = allTasks.find((t: any) => t.id === id);
    const chatId = original?.chatId ?? jarvisScheduler.getAdminChatId();
    jarvisScheduler.cancelTask(id);
    const newTaskId = jarvisScheduler.schedule(chatId, type, content, delay_seconds);
    logger.info("API", `[TaskMonitor] Task ${id} modified → new task ${newTaskId}`);
    res.json({ success: true, newTaskId });
  } catch (err: any) {
    logger.error("API", "PATCH /tasks/:id error", err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/iris/execute
 * Generic execution bridge used by the Live Voice UI (Zoya). The frontend
 * posts a single I.R.I.S. action here, and we forward it to the local daemon
 * via irisExecutor. Returns the daemon's structured {success, message, data}.
 *
 * NOTE: This is distinct from executeOnIrisWithVerification() used in the text
 * chat planner — the Live UI wants a plain, fast passthrough so it can stream
 * the result back to Gemini without an extra verification round-trip.
 */
router.post("/iris/execute", async (req, res) => {
  const { action, ...payload } = req.body || {};
  if (!action) {
    return res.status(400).json({ success: false, message: "Missing 'action' in body." });
  }
  try {
    const { executeOnIris } = await import("../irisExecutor");
    const result = await executeOnIris(action, payload);
    // Flatten the executor's double-wrap so the frontend sees the daemon's
    // native shape: { success, message, data: { base64, mimeType, ... } }.
    // executeOnIris nests the full daemon response under its own `data` key,
    // so unwrap one level to expose data.base64 directly.
    res.json({
      success: result.success,
      message: result.message,
      data: (result.data as any)?.data ?? result.data,
    });
  } catch (err: any) {
    logger.error("API", `POST /api/iris/execute error: ${err.message}`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/iris/status
 * Real-time health check — J.A.R.V.I.S. pings I.R.I.S. to see if the Hands are alive.
 * The frontend UI can call this to show an "I.R.I.S. Connected 🟢" indicator.
 */
router.get("/iris/status", async (_req, res) => {
  const { executeOnIris } = await import("../irisExecutor");
  const result = await executeOnIris("ping", {});
  if (result.success) {
    res.json({ connected: true, message: "I.R.I.S. is online and ready." });
  } else {
    res.json({ connected: false, message: result.message });
  }
});

/**
 * GET /api/system/metrics
 * Fetches current system metrics (CPU, RAM, battery, processes)
 * Used by I.R.I.S. dashboard to display live telemetry
 */
router.get("/system/metrics", async (_req, res) => {
  try {
    const { getSystemMetrics } = await import("../systemMonitor");
    const metrics = await getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error: any) {
    logger.error("API", "System metrics fetch error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system/status
 * Returns monitoring status and current thresholds
 */
router.get("/system/status", async (_req, res) => {
  try {
    const { getMonitoringStatus, getThresholds } = await import("../systemMonitor");
    const status = getMonitoringStatus();
    const thresholds = getThresholds();
    res.json({ success: true, active: status.active, thresholds });
  } catch (error: any) {
    logger.error("API", "System status fetch error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/system/thresholds
 * Updates alert thresholds (CPU, RAM, battery percentages)
 * Body: { cpu?: number, ram?: number, battery?: number }
 */
router.post("/system/thresholds", async (req, res) => {
  try {
    const { cpu, ram, battery } = req.body;
    const { setThresholds, getThresholds } = await import("../systemMonitor");
    
    const thresholds: any = {};
    if (cpu !== undefined) thresholds.cpu = parseInt(cpu);
    if (ram !== undefined) thresholds.ram = parseInt(ram);
    if (battery !== undefined) thresholds.battery = parseInt(battery);
    
    setThresholds(thresholds);
    logger.info("API", `Thresholds updated via dashboard: ${JSON.stringify(thresholds)}`);
    
    res.json({ success: true, thresholds: getThresholds() });
  } catch (error: any) {
    logger.error("API", "Threshold update error", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/system/start
 * Starts the system monitoring loop
 * Body: { interval?: number (milliseconds) }
 */
router.post("/system/start", async (req, res) => {
  try {
    const { interval } = req.body;
    const { startMonitoring } = await import("../systemMonitor");
    startMonitoring(interval || 10000);
    logger.info("API", `System monitoring started via dashboard`);
    res.json({ success: true, message: "System monitoring started." });
  } catch (error: any) {
    logger.error("API", "Failed to start monitoring", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/system/stop
 * Stops the system monitoring loop
 */
router.post("/system/stop", async (_req, res) => {
  try {
    const { stopMonitoring } = await import("../systemMonitor");
    stopMonitoring();
    logger.info("API", `System monitoring stopped via dashboard`);
    res.json({ success: true, message: "System monitoring stopped." });
  } catch (error: any) {
    logger.error("API", "Failed to stop monitoring", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system/known-apps
 * Returns the list of known applications for baseline comparison
 */
router.get("/system/known-apps", async (_req, res) => {
  try {
    const { getSystemConfig } = await import("../systemConfig");
    const config = await getSystemConfig();
    res.json({ success: true, applications: config.knownApplications || [] });
  } catch (error: any) {
    logger.error("API", "Failed to fetch known apps", error);
    res.json({ success: true, applications: [] });
  }
});

/**
 * POST /api/system/known-apps
 * Updates the list of known applications
 * Body: { applications: string[] }
 */
router.post("/system/known-apps", async (req, res) => {
  try {
    const { applications } = req.body;
    if (!Array.isArray(applications)) {
      return res.status(400).json({ success: false, error: "Applications must be an array" });
    }
    
    const { updateKnownApplications } = await import("../systemConfig");
    await updateKnownApplications(applications);
    logger.info("API", `Known applications updated: ${applications.length} apps`);
    res.json({ success: true, message: "Known applications updated." });
  } catch (error: any) {
    logger.error("API", "Failed to update known apps", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/jobs
 * Returns all research jobs
 */
router.get("/jobs", async (req, res) => {
  try {
    const { supabase } = await import("../supabaseClient");
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

    const { data, error } = await supabase.from("research_jobs").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, jobs: data });
  } catch (error: any) {
    logger.error("API", "Failed to fetch jobs", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/jobs
 * Create a new recurring routine job.
 *
 * Body:
 *   topic        — Human-readable intent (e.g. "drink water", "check crypto prices")
 *   routine_type — "research" | "reminder" | "message"  (default: "research")
 *   time_of_day  — 5-field cron expression (e.g. "0 8 * * *")
 *   chat_id      — optional Telegram chat ID (defaults to 0 = admin)
 *
 * The topic is encoded via encodeRoutineTopic() so cronJobs.ts can distinguish
 * research vs reminder vs message routines at execution time.
 */
router.post("/jobs", async (req, res) => {
  try {
    const { topic, routine_type, time_of_day, chat_id } = req.body;
    if (!topic || !time_of_day) {
      return res.status(400).json({ error: "Missing topic or time_of_day" });
    }

    const { supabase } = await import("../supabaseClient");
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

    const targetChatId = chat_id || 0;

    // Validate and normalize routine_type; default to "research" for back-compat.
    const validTypes = ["research", "reminder", "message"];
    const resolvedType: "research" | "reminder" | "message" = validTypes.includes(routine_type)
      ? routine_type
      : "research";

    // Encode the topic so cronJobs.ts can identify the routine type at fire time.
    // If the topic is already encoded (e.g. sent by parseAndSchedule), leave it as-is.
    const { encodeRoutineTopic, ROUTINE_PREFIX } = await import("../scheduler");
    const encodedTopic = topic.startsWith(ROUTINE_PREFIX)
      ? topic
      : encodeRoutineTopic(resolvedType, topic);

    const { data, error } = await supabase
      .from("research_jobs")
      .insert({ topic: encodedTopic, time_of_day, chat_id: targetChatId, is_active: true })
      .select()
      .single();

    if (error) throw error;

    const { cronJobManager } = await import("../cronJobs");
    cronJobManager.scheduleJob(data);

    logger.info("API", `[Jobs] Created ${resolvedType} routine: "${topic}" @ cron: ${time_of_day}`);
    res.json({ success: true, job: data });
  } catch (error: any) {
    logger.error("API", "Failed to create job", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/jobs/:id
 */
router.delete("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { supabase } = await import("../supabaseClient");
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

    const { error } = await supabase.from("research_jobs").delete().eq("id", id);
    if (error) throw error;

    const { cronJobManager } = await import("../cronJobs");
    cronJobManager.unscheduleJob(id);

    res.json({ success: true });
  } catch (error: any) {
    logger.error("API", "Failed to delete job", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/jobs/:id
 * Update a recurring routine. Supports toggling is_active, changing topic/cron/chat_id.
 *
 * When sending a plain-text topic (not already encoded), also send routine_type
 * so we know how to encode it correctly. Defaults to "research" for back-compat.
 */
router.patch("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, topic, routine_type, time_of_day, chat_id } = req.body;

    const updates: Record<string, any> = {};
    if (typeof is_active === "boolean") updates.is_active = is_active;
    if (typeof time_of_day === "string" && time_of_day.trim()) updates.time_of_day = time_of_day.trim();
    if (chat_id !== undefined) updates.chat_id = chat_id || 0;

    // Encode the topic when updating — preserve encoding if already structured.
    if (typeof topic === "string" && topic.trim()) {
      const { encodeRoutineTopic, ROUTINE_PREFIX } = await import("../scheduler");
      const validTypes = ["research", "reminder", "message"];
      const resolvedType: "research" | "reminder" | "message" = validTypes.includes(routine_type)
        ? routine_type
        : "research";
      updates.topic = topic.trim().startsWith(ROUTINE_PREFIX)
        ? topic.trim()
        : encodeRoutineTopic(resolvedType, topic.trim());
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No supported job fields provided" });
    }

    const { supabase } = await import("../supabaseClient");
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

    const { data, error } = await supabase
      .from("research_jobs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const { cronJobManager } = await import("../cronJobs");
    if (data.is_active) {
      cronJobManager.scheduleJob(data);
    } else {
      cronJobManager.unscheduleJob(id);
    }

    logger.info("API", `[Jobs] Updated job ${id}: is_active=${data.is_active}`);
    res.json({ success: true, job: data });
  } catch (error: any) {
    logger.error("API", "Failed to update job", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
export default router;
