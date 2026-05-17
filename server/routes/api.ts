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

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

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

// ── Remote Debugging Endpoint ──
router.get("/logs", (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>JARVIS Live Telemetry</title>
  <style>
    body { background-color: #061118; color: #fff; font-family: 'Consolas', monospace; padding: 20px; margin: 0; }
    h2 { color: #00e5ff; margin: 0; font-family: 'Segoe UI', sans-serif; letter-spacing: 4px; font-weight: 300; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #1a3c54; }
    #logs-container { height: calc(100vh - 100px); overflow-y: auto; background: #02080d; padding: 15px; border: 1px solid #112d40; border-radius: 8px; box-shadow: inset 0 0 20px rgba(0, 229, 255, 0.05); }
    .log-line { margin: 4px 0; padding: 4px 8px; border-bottom: 1px solid #0a1b26; line-height: 1.4; word-wrap: break-word; transition: background 0.2s; }
    .log-line:hover { background: #0a1b26; }
    .timestamp { color: #5a7b8c; font-size: 0.9em; }
    .level-INFO { color: #00e5ff; font-weight: bold; }
    .level-ERROR { color: #ff3366; font-weight: bold; text-shadow: 0 0 8px rgba(255, 51, 102, 0.5); }
    .level-WARN { color: #ffcc00; font-weight: bold; }
    .level-DEBUG { color: #888; }
    .tag { color: #bd93f9; }
    .toggle { display: flex; align-items: center; gap: 8px; color: #888; font-family: 'Segoe UI', sans-serif; font-size: 14px; cursor: pointer; }
    input[type=checkbox] { accent-color: #00e5ff; transform: scale(1.2); cursor: pointer; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: #02080d; }
    ::-webkit-scrollbar-thumb { background: #1a3c54; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #00e5ff; }
  </style>
</head>
<body>
  <div class="header">
    <h2>J.A.R.V.I.S. TELEMETRY</h2>
    <label class="toggle">
      <input type="checkbox" id="autoscroll" checked> 
      <span style="color: #00e5ff;">AUTO-SYNC</span>
    </label>
  </div>
  <div id="logs-container"></div>
  <script>
    const container = document.getElementById('logs-container');
    const autoscroll = document.getElementById('autoscroll');
    
    function escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    let renderedLineCount = 0;
    
    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs/raw');
        const text = await res.text();
        const lines = text.split('\\n');
        
        if (lines.length === renderedLineCount) return;
        
        const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
        let html = '';
        
        for(let i = renderedLineCount; i < lines.length; i++) {
           const line = lines[i];
           if(!line.trim() && i === lines.length - 1) continue;
           const match = line.match(/^\\[(.*?)\\] \\[(.*?)\\] \\[(.*?)\\] (.*)$/);
           if(match) {
              const [_, time, level, tag, msg] = match;
              html += \`<div class="log-line">
                <span class="timestamp">[\${escapeHtml(time)}]</span> 
                <span class="level-\${escapeHtml(level)}">[\${escapeHtml(level)}]</span> 
                <span class="tag">[\${escapeHtml(tag)}]</span> 
                <span style="color: \${level === 'ERROR' ? '#ff88aa' : '#e0f7fa'}">\${escapeHtml(msg)}</span>
              </div>\`;
           } else {
              html += \`<div class="log-line" style="color: #888;">\${escapeHtml(line)}</div>\`;
           }
        }
        
        container.insertAdjacentHTML('beforeend', html);
        renderedLineCount = lines.length;
        
        if(autoscroll.checked && isAtBottom) {
          container.scrollTop = container.scrollHeight;
        }
      } catch(e) {
        console.error("Failed to sync telemetry");
      }
    }
    
    fetchLogs();
    setInterval(fetchLogs, 2000);
  </script>
</body>
</html>
  `);
});

router.get("/logs/raw", (req, res) => {
  const logPath = path.resolve(process.cwd(), 'logs', 'debug.log');
  if (fs.existsSync(logPath)) {
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(logPath).pipe(res);
  } else {
    res.status(404).send("No debug.log found yet.");
  }
});

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

    // Execute Python actions
    const browserActions = plannedSteps.filter((s:any) => s.action !== 'serp_api_search');
    if (browserActions.length > 0) {
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
      // Direct Conversational Mode using Cascading Brains
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
        const reasoning = internal_steps.map((s: string) => `> _${s}_`).join('\n');
        res.write(`data: ${JSON.stringify({ content: `${reasoning}\n\n` })}\n\n`);
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

      // D. Node Action Execution (SerpAPI, Scheduler)
      const nodeActions = plannedSteps.filter((s:any) => s.action === 'serp_api_search' || s.action === 'schedule_call' || s.action === 'schedule_message');
      const browserActions = plannedSteps.filter((s:any) => !['serp_api_search', 'schedule_call', 'schedule_message'].includes(s.action));

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

      // E. Execute via Python Layer
      if (browserActions.length > 0) {
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

export default router;
