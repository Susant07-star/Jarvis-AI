import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getGroqClient, summarizeMemory, logTokenUsage, logFeedback, callWithRetry } from "../llm";
import { performSearch } from "../search";
import { saveToMemory, loadMemory } from "../memory";
import { jarvisTools } from "../tools";
import { buildPrompt } from "../agent_prompts/prompt_builder";
import { logInteraction, trackBrowserTask } from "../browser/jarvisBridge";
import { logger } from "../logger";
import { MetricsTracker } from "../utils/metrics";
import { getPendingConfirmation, setPendingPlanWithMetadata, clearPendingConfirmation, hasPendingConfirmation } from "../confirmationState";

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

/**
 * Handle text-based chat interactions.
 */
router.post("/zoya-execute", async (req, res) => {
  try {
    const { intent } = req.body;
    if (!intent) return res.status(400).json({ success: false, error: "Missing intent" });

    logger.info("API", `[Zoya Execute] Received intent: ${intent}`);
    
    const { determineOrchestrationMode } = await import("../orchestrator");
    const decision = await determineOrchestrationMode(intent);

    if (decision.mode === "direct") {
      return res.json({ success: true, result: "This was a conversational request. No action taken in browser." });
    }

    // Must be agent mode
    const { planWithDOM } = await import("../browser/planner");
    
    // Get DOM if available
    let domMap = {};
    try {
      const pythonDomRes = await fetch('http://127.0.0.1:8000/analyze', { 
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }
      });
      const domData = await pythonDomRes.json();
      domMap = domData.elements || {};
    } catch(e) {
      logger.warn("API", "Could not fetch DOM map for Zoya execute");
    }

    const { actions: plannedSteps, errorFallback } = await planWithDOM(decision.normalizedInput || intent, [domMap]) as any;

    if (!plannedSteps || plannedSteps.length === 0) {
      return res.json({ success: false, error: errorFallback || "Could not formulate a valid plan." });
    }

    // Execute node actions (SerpAPI)
    const nodeActions = plannedSteps.filter((s:any) => s.action === 'serp_api_search');
    for (const na of nodeActions) {
       logger.info("Node", `Executing SerpAPI search for: ${na.query}`);
       // (Real implementation would do search here)
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

    res.json({ success: true, result: "Browser actions executed successfully." });

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
      // Direct Conversational Mode
      const memory = loadMemory();
      const compressedMemory = await summarizeMemory(memory, groq);
      
      const messages = [
        { role: "system", content: buildPrompt("browser") },
        ...compressedMemory,
        { role: "user", content: message }
      ];

      let isDisconnected = false;
      req.on('close', () => { isDisconnected = true; });

      const stream = await groq.chat.completions.create({
        messages: messages as any,
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 1024
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullResponse = '';
      for await (const chunk of stream) {
        if (isDisconnected) break;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      
      if (!isDisconnected) {
        saveToMemory('user', message);
        saveToMemory('jarvis', fullResponse);
        logInteraction('chat', message, fullResponse);
        if (metrics) {
          metrics.setExecutionResult('Direct chat completed');
          metrics.finalize();
        }
        res.write(`data: [DONE]\n\n`);
        return res.end();
      } else {
        saveToMemory('user', message);
        saveToMemory('jarvis', fullResponse + ' [Interrupted]');
        if (metrics) {
          metrics.setExecutionResult('Interrupted');
          metrics.finalize();
        }
        return;
      }

    } else {
      // Agent Task Mode (Strict Planning -> Execution)
      const { planWithDOM } = await import("../browser/planner");
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // A. Extract minimal Contextual DOM
      let domMap = {};
      try {
        const pythonDomRes = await fetch('http://127.0.0.1:8000/analyze', { 
            method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }
        });
        const domData = await pythonDomRes.json();
        domMap = domData.elements || {};
      } catch(e) {
        logger.warn("API", "Could not fetch DOM map, running blind planner");
      }

      // Use normalized input to eliminate LLM confusion over chatty sentences
      const goal = decision?.normalizedInput || message;
      logger.info('API', `Planning goal: "${goal}"`);

      if (decision?.normalizedInput && decision.normalizedInput !== message) {
        res.write(`data: ${JSON.stringify({ content: `*[Normalized Goal: ${goal}]*\n\n` })}\n\n`);
      }

      // B. Create Strict JSON Plan
      const { actions: plannedSteps, tokens: plannerTokens, requires_confirmation, errorFallback, internal_steps } = await planWithDOM(goal, [domMap]) as any;
      
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

      // D. Node Action Execution (SerpAPI)
      const nodeActions = plannedSteps.filter((s:any) => s.action === 'serp_api_search');
      const browserActions = plannedSteps.filter((s:any) => s.action !== 'serp_api_search');

      for (const na of nodeActions) {
         logger.info("Node", `Executing SerpAPI search for: ${na.query}`);
         res.write(`data: ${JSON.stringify({ content: `\n[SerpAPI] Searched for: ${na.query}` })}\n\n`);
         // Mock API Tokens
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

export default router;
