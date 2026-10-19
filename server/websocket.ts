import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { getGroqClient, summarizeMemory, logTokenUsage, callWithRetry } from "./llm";
import { transcribeAudio } from "./stt";
import { generateTTS } from "./tts";
import { saveToMemory, loadMemory } from "./memory";
import { getJarvisTools } from "./tools";
import { performSearch } from "./search";
import { buildPrompt } from "./agent_prompts/prompt_builder";
import { logInteraction, trackBrowserTask } from "./browser/jarvisBridge";
import { logger } from "./logger";
import { MetricsTracker } from "./utils/metrics";
import { runAutonomousLoop } from "./agenticLoop";
import { ThreadManager } from "./threadManager";
import { jarvisScheduler } from "./scheduler";

import { getPendingConfirmation, setPendingPlanWithMetadata, clearPendingConfirmation, hasPendingConfirmation, checkConfirmationInput } from "./confirmationState";

interface ConnectionState {
  audioBuffer: Buffer[];
  isProcessing: boolean;
  isSpeaking: boolean;
  abortController: AbortController | null;
}

/**
 * Initializes the WebSocket server for real-time voice interaction.
 */
export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: any) => {
    // ── Global Security Enforcement ──
    const requiredPin = process.env.JARVIS_PIN?.trim();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const providedPin = url.searchParams.get('pin');
    if (!requiredPin || providedPin !== requiredPin) {
      logger.warn('WS', 'Unauthorized WebSocket connection attempt (Invalid PIN)');
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid Master PIN.' }));
      ws.close();
      return;
    }

    logger.info('WS', 'New connection established');

    const state: ConnectionState = {
      audioBuffer: [],
      isProcessing: false,
      isSpeaking: false,
      abortController: null
    };

    ws.on('message', async (data: any, isBinary: boolean) => {
      try {
        if (isBinary) {
          // Accumulate audio chunks
          state.audioBuffer.push(data);
          // Keep only the last 4 chunks (approx 1 second) of silence before speech starts
          if (!state.isSpeaking && state.audioBuffer.length > 4) {
            state.audioBuffer.shift();
          }
        } else {
          // Handle JSON commands
          let parsedData;
          try {
            parsedData = JSON.parse(data.toString());
          } catch (e) {
            console.warn('[WebSocket] Received invalid JSON:', data.toString());
            return;
          }

          if (parsedData.type === 'speech_start') {
            state.isSpeaking = true;

            if (state.isProcessing && state.abortController) {
              console.log('[WebSocket] User interrupted. Aborting current generation.');
              state.abortController.abort();
              state.abortController = null;
              state.isProcessing = false;
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          } else if (parsedData.type === 'speech_end') {
            state.isSpeaking = false;

            if (state.isProcessing) {
              console.log('[WebSocket] Already processing. Ignoring speech_end.');
              return;
            }

            const currentAudio = state.audioBuffer;
            state.audioBuffer = []; // Reset buffer immediately for next utterance

            state.abortController = new AbortController();

            // Fire and forget, state is managed inside
            handleSpeechEnd(ws, currentAudio, state).catch(e => {
              if (e.name !== 'AbortError') {
                console.error('[WebSocket] Unhandled error in handleSpeechEnd:', e);
              }
            });
          }
        }
      } catch (e) {
        console.error('[WebSocket] Message handling error:', e);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Connection closed');
      if (state.abortController) {
        state.abortController.abort();
      }
    });
  });
}

/**
 * Handles the end of a speech segment.
 * Orchestrates STT -> LLM -> TTS pipeline.
 */
async function handleSpeechEnd(ws: WebSocket, audioBuffer: Buffer[], state: ConnectionState) {
  logger.info('WS', `Received speech_end. Processing ${audioBuffer.length} chunks.`);

  if (audioBuffer.length === 0) {
    logger.info('WS', 'Audio buffer empty. Sending done.');
    ws.send(JSON.stringify({ type: 'done' }));
    return;
  }

  state.isProcessing = true;
  ws.send(JSON.stringify({ type: 'processing' }));

  let metrics: MetricsTracker | null = null;

  try {
    const groq = getGroqClient();

    // 1. STT: Transcribe
    let userText = await transcribeAudio(audioBuffer, groq);
    metrics = new MetricsTracker(userText || '');

    // Send final STT transcription back to UI so it displays immediately
    if (userText) {
      ws.send(JSON.stringify({ type: 'final', text: userText }));
    }

    // ── Pending Enrollment Interception ──
    const threadId = (ws as any).threadId || "ws_client";
    const { pendingVoiceEnrollments } = await import("./voiceEnrollmentCache");
    if (pendingVoiceEnrollments.has(threadId)) {
      const pending = pendingVoiceEnrollments.get(threadId)!;
      if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
        pendingVoiceEnrollments.delete(threadId);
      } else {
        const nameMatch = (userText || "").match(/(?:my name is|his name is|her name is|they are|this is|it is|it's) ([\w\s]+)/i);
        const extractedName = nameMatch ? nameMatch[1].trim() : (userText || "").trim();
        const { supabase } = await import("./supabaseClient");
        if (supabase) {
          await supabase.from("voice_profiles").insert({
            name: extractedName,
            embedding_b64: pending.embedding
          });
          logger.info("WS", `Successfully enrolled unknown voice as: ${extractedName}`);
          const reply = `Got it. Biometric profile saved for ${extractedName}. I will remember this voice.`;
          ws.send(JSON.stringify({ type: 'llm_chunk', text: reply }));
          const replyAudio = await generateTTS(reply);
          if (replyAudio && ws.readyState === ws.OPEN) ws.send(replyAudio);
        }
        pendingVoiceEnrollments.delete(threadId);
        if (pending.originalText) {
          userText = `(My name is ${extractedName}) ${pending.originalText}`;
          // Fall through to LLM processing
        } else {
          ws.send(JSON.stringify({ type: 'done' }));
          state.isProcessing = false;
          return;
        }
      }
    }

    // ── Voice Biometrics & Authentication ──
    // DISABLED by default. The WebSocket is PIN-protected at connection time,
    // so any caller who passed the PIN check is the Boss.
    // Set ENABLE_VOICE_BIOMETRICS=true in .env.local to re-enable speaker verification.
    const fullBuffer = Buffer.concat(audioBuffer);
    let voiceResult: any = { speaker: "boss", confidence: 1.0, liveness: true, embedding: "" };

    if (process.env.ENABLE_VOICE_BIOMETRICS === "true") {
      const { verifyVoice } = await import("./voice_bridge");
      try {
        voiceResult = await verifyVoice(fullBuffer);
      } catch (err: any) {
        logger.error("WS", `Voice verification error: ${err.message}. Defaulting to Boss.`);
      }

      if (!voiceResult.liveness) {
        const alertMsg = "Security Alert: Audio liveness check failed. Playback detected.";
        ws.send(JSON.stringify({ type: 'llm_chunk', text: alertMsg }));
        ws.send(JSON.stringify({ type: 'done' }));
        state.isProcessing = false;
        return;
      }

      if (voiceResult.speaker === "unknown" && voiceResult.embedding) {
        pendingVoiceEnrollments.set(threadId, {
          embedding: voiceResult.embedding,
          timestamp: Date.now(),
          originalText: userText || ""
        });
        const prompt = "I detected an unrecognized voice. Who are you? Please reply with your name so I can remember you.";
        ws.send(JSON.stringify({ type: 'llm_chunk', text: prompt }));
        const promptAudio = await generateTTS(prompt);
        if (promptAudio && ws.readyState === ws.OPEN) ws.send(promptAudio);
        ws.send(JSON.stringify({ type: 'done' }));
        state.isProcessing = false;
        return;
      }
    }

    const isBossVoice = voiceResult.speaker === "boss";
    if (isBossVoice) {
      logger.info("WS", `✅ Boss verified (biometrics ${process.env.ENABLE_VOICE_BIOMETRICS === "true" ? `confidence: ${(voiceResult.confidence * 100).toFixed(1)}%` : "bypassed"})`);
    } else {
      logger.info("WS", `👤 Known speaker (${voiceResult.speaker}) — chat-only mode.`);
    }
    // ── End Voice Biometrics ───────────────────────────────────────────────



    // 0. Check Confirmation Loop using centralized State Guard
    const confirmationResult = checkConfirmationInput(userText || '');
    if (confirmationResult.handled) {
      const { type, plan, message } = confirmationResult;

      if (type === 'confirmed' && plan) {
        logger.info("Confirmation", "Approved pending WS plan");
        const browserActions = plan.actions.filter((s: any) => s.action !== 'serp_api_search');
        const execMsg = message || `Executing confirmed steps.`;
        ws.send(JSON.stringify({ type: 'llm_chunk', text: execMsg + " " }));
        const execAudio = await generateTTS(execMsg);
        if (execAudio && ws.readyState === ws.OPEN) ws.send(execAudio);

        if (browserActions.length > 0) {
          ws.send(JSON.stringify({ type: 'browser_commands', commands: browserActions }));
          try {
            const response = await fetch('http://127.0.0.1:8000/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commands: browserActions })
            });
            logger.info("WS", `Python executor returned: ${response.status}`);
            const pythonData = await response.json();
            const hasFailure = pythonData.results && Array.isArray(pythonData.results) && pythonData.results.some((r: any) => r.status === 'failure');
            if (hasFailure) {
              const errors = pythonData.results.filter((r: any) => r.status === 'failure').map((r: any) => `${r.action}: ${r.details}`).join(', ');
              throw new Error(`Browser execution failed: ${errors}`);
            }
          } catch (e: any) {
            logger.error('WS', `Python agent execution failed: ${e.message}`);
            const failReply = `❌ Execution failed: ${e.message}`;
            ws.send(JSON.stringify({ type: 'llm_chunk', text: failReply }));
            const failAudio = await generateTTS(failReply);
            if (failAudio && ws.readyState === ws.OPEN) ws.send(failAudio);
            saveToMemory('jarvis', failReply);
            logInteraction('voice', userText || '', failReply);
            ws.send(JSON.stringify({ type: 'done' }));
            if (metrics) { metrics.setExecutionResult('Failure via confirmation'); metrics.finalize(); }
            state.isProcessing = false;
            return;
          }
        }

        const successReply = message || `Confirmed task executed.`;
        saveToMemory('user', userText || '');
        saveToMemory('jarvis', successReply);
        logInteraction('voice', userText || '', successReply, { browserCommands: plan.actions });
        trackBrowserTask('voice', userText || '', plan.actions);

        ws.send(JSON.stringify({ type: 'done' }));
        if (metrics) {
          metrics.setExecutionResult('Success via confirmation');
          metrics.finalize();
        }
        state.isProcessing = false;
        return;
      } else if (type === 'cancelled') {
        logger.info("Confirmation", "Cancelled pending WS plan");
        const cancelReply = message || "Action cancelled.";
        ws.send(JSON.stringify({ type: 'llm_chunk', text: cancelReply + " " }));
        const cancelAudio = await generateTTS(cancelReply);
        if (cancelAudio && ws.readyState === ws.OPEN) ws.send(cancelAudio);
        ws.send(JSON.stringify({ type: 'done' }));

        if (metrics) { metrics.setExecutionResult('Cancelled by user'); metrics.finalize(); }
        state.isProcessing = false;
        return;
      } else if (type === 'ambiguous') {
        logger.info("Confirmation", `Waiting on confirmation, received ambiguous input: "${userText}"`);
        const reprompt = message || "Please confirm the previous task (yes/no)";
        ws.send(JSON.stringify({ type: 'llm_chunk', text: reprompt + " " }));
        const repromptAudio = await generateTTS(reprompt);
        if (repromptAudio && ws.readyState === ws.OPEN) ws.send(repromptAudio);
        ws.send(JSON.stringify({ type: 'done' }));
        state.isProcessing = false;
        return;
      } else if (type === 'new_command') {
        // fall through to normal processing (the new command will be handled by orchestrator)
        logger.info("Confirmation", "New command received, discarding pending plan");
        // continue to orchestrator
      }
    }

    if (state.abortController?.signal.aborted) throw new Error('AbortError');

    if (!userText) {
      logger.info('WS', 'Transcription empty.');
      state.isProcessing = false;
      ws.send(JSON.stringify({ type: 'done' }));
      return;
    }

    // NOTE: { type: 'final' } was already sent at line ~130 immediately after STT.
    // Sending it again here would cause React to skip the useEffect (same value, no re-render).
    saveToMemory('user', userText);

    const memory = loadMemory();
    const compressedMemory = await summarizeMemory(memory, groq);

    if (state.abortController?.signal.aborted) throw new Error('AbortError');

    // 3. LLM: Prepare messages
    logger.info('WS', `LLM for: "${userText}"`);
    // Orchestrator routing
    const { determineOrchestrationMode } = await import("./orchestrator");
    const decision = await determineOrchestrationMode(userText);
    if (metrics) {
      metrics.setIntent(decision.intent);
      metrics.setMode(decision.mode);
      if (decision.tokens) metrics.addTokens('classifier', decision.tokens);
    }
    logger.info("WS", `Orchestrator Decision: ${JSON.stringify(decision)}`);

    if (state.abortController?.signal.aborted) throw new Error('AbortError');

    let streamFinalResponse = true;
    let fullResponse = '';
    let sentenceBuffer = '';

    if (!isBossVoice && decision.mode !== "direct") {
      const restrictedMsg = "I'm sorry, but system commands, scheduling, and browser actions are restricted to the Boss only. I can still chat with you though!";
      ws.send(JSON.stringify({ type: 'llm_chunk', text: restrictedMsg }));
      const restrictedAudio = await generateTTS(restrictedMsg);
      if (restrictedAudio && ws.readyState === ws.OPEN) ws.send(restrictedAudio);
      ws.send(JSON.stringify({ type: 'done' }));
      state.isProcessing = false;
      return;
    }

    if (decision.mode === "direct") {
      // ── SCHEDULE INTERCEPT (Voice) ────────────────────────────────────────
      // Same fix as telegramBot.ts: "daily alarm", "remind me every morning", etc.
      // must hit jarvisScheduler.parseAndSchedule(), not the chat LLM stream.
      if (decision.intent === "schedule") {
        logger.info("WS", `[SCHEDULE INTERCEPT] Routing voice to native parseAndSchedule: "${userText}"`);
        try {
          const { jarvisScheduler } = await import("./scheduler");
          const threadId = (ws as any).threadId || "ws_client";
          const chatIdMatch = threadId.match(/tg_(\d+)/);
          const chatId = chatIdMatch ? parseInt(chatIdMatch[1]) : (jarvisScheduler.getAdminChatId() || 0);
          const scheduleResult = await jarvisScheduler.parseAndSchedule(userText, chatId);
          ws.send(JSON.stringify({ type: 'llm_chunk', text: scheduleResult.message }));
          const schedAudio = await generateTTS(scheduleResult.message);
          if (!state.abortController?.signal.aborted && schedAudio && ws.readyState === ws.OPEN) {
            ws.send(schedAudio);
          }
          saveToMemory('user', userText);
          saveToMemory('jarvis', scheduleResult.message);
          logInteraction('voice', userText, scheduleResult.message);
          if (metrics) {
            metrics.setExecutionResult(`Schedule: ${scheduleResult.success ? 'OK' : 'FAIL'}`);
            metrics.finalize();
          }
          ws.send(JSON.stringify({ type: 'done' }));
          state.isProcessing = false;
          return;
        } catch (err: any) {
          logger.error("WS", `[SCHEDULE] parseAndSchedule voice error: ${err.message}`);
          const errMsg = "I couldn't process that scheduling request. Please try again clearly stating the time and what to remind you of.";
          ws.send(JSON.stringify({ type: 'llm_chunk', text: errMsg }));
          const errAudio = await generateTTS(errMsg);
          if (errAudio && ws.readyState === ws.OPEN) ws.send(errAudio);
          ws.send(JSON.stringify({ type: 'done' }));
          state.isProcessing = false;
          return;
        }
      }

      // Direct Conversational Mode
      logger.info('WS', `LLM for: "${userText}"`);
      const messages = [
        { role: "system", content: buildPrompt("voice") }, // lightweight prompt for chat
        ...compressedMemory
      ];

      const stream = await groq.chat.completions.create({
        messages: messages as any,
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 1024
      });

      ws.send(JSON.stringify({
        type: 'metadata',
        metadata: {
          model: "llama-3.3-70b-versatile",
          provider: "Groq"
        }
      }));
      ws.send(JSON.stringify({ type: 'llm_start' }));

      for await (const chunk of stream) {
        if (state.abortController?.signal.aborted) throw new Error('AbortError');

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          sentenceBuffer += content;

          ws.send(JSON.stringify({ type: 'llm_chunk', text: content }));

          let sentenceMatch;
          while ((sentenceMatch = sentenceBuffer.match(/.*?[.!?]+(?=\s|$)/))) {
            const sentence = sentenceMatch[0];
            sentenceBuffer = sentenceBuffer.substring(sentence.length).trimStart();

            const audioBuf = await generateTTS(sentence);
            if (state.abortController?.signal.aborted) throw new Error('AbortError');

            if (audioBuf && ws.readyState === ws.OPEN) {
              ws.send(audioBuf);
            }
          }
        }
      }

      // Process any remaining text in the buffer
      if (sentenceBuffer.trim()) {
        const audioBuf = await generateTTS(sentenceBuffer.trim());
        if (!state.abortController?.signal.aborted && audioBuf && ws.readyState === ws.OPEN) {
          ws.send(audioBuf);
        }
      }

      if (!state.abortController?.signal.aborted) {
        logger.info('WS', `Initial stream complete: ${fullResponse.length} chars`);

        // ── Autonomous Tool Handler (ReAct loop) ──────────────────────────────
        // After the initial voice stream, check if a tool was called.
        // If so, run the full autonomous loop to handle chained tool calls.
        if (fullResponse.includes('"tool"')) {
          try {
            // Get thread for context
            const adminChatId = jarvisScheduler.getAdminChatId();
            const threadId = adminChatId ? `tg_${adminChatId}` : 'ws_default';
            await ThreadManager.appendMessage(threadId, { role: "user", content: userText });
            await ThreadManager.appendMessage(threadId, { role: "assistant", content: fullResponse });

            // Build messages so the loop can continue from where stream left off
            const loopMessages = [
              { role: "system", content: buildPrompt("voice") },
              ...compressedMemory,
              { role: "user", content: userText },
              { role: "assistant", content: fullResponse } // the streamed tool call
            ];

            const loopResult = await runAutonomousLoop(loopMessages as any, {
              threadId,
              chatId: adminChatId || undefined,
              useVerification: false,
              onStreamEvent: (type, data) => {
                ws.send(JSON.stringify({ type: 'tool_event', event: type, data }));
              }
            }, 7);

            // Send loop result as a final text chunk + TTS
            ws.send(JSON.stringify({ type: 'llm_chunk', text: `\n\n${loopResult.content}` }));
            const audioBuf = await generateTTS(loopResult.content);
            if (audioBuf && ws.readyState === ws.OPEN) ws.send(audioBuf);
            saveToMemory('jarvis', loopResult.content);
          } catch (err: any) {
            logger.error("WS", `[ReAct Loop Error]: ${err.message}`);
          }
        } else {
          saveToMemory('jarvis', fullResponse);
        }

        logInteraction('voice', userText, fullResponse);
        if (metrics) metrics.setExecutionResult('Direct chat complete');
        ws.send(JSON.stringify({ type: 'done' }));
      } else {
        if (metrics) metrics.setExecutionResult('Interrupted');
      }

    } else {
      // Agent Task Mode (Strict Planning -> Execution)
      const { planWithVisualAgent } = await import("./browser/planner");

      // LLM start signal, but no verbose audio
      ws.send(JSON.stringify({ type: 'llm_start' }));

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
      } catch (e) {
        logger.warn("WS", "Could not fetch marked screenshot, running blind planner");
      }

      if (state.abortController?.signal.aborted) throw new Error('AbortError');

      const goal = decision?.normalizedInput || userText;
      logger.info('WS', `Planning goal: "${goal}"`);

      if (decision?.normalizedInput && decision.normalizedInput !== userText) {
        ws.send(JSON.stringify({ type: 'llm_chunk', text: `*[Normalized Goal: ${goal}]*\n\n` }));
      }

      // B. Create Strict JSON Plan
      const { actions: plannedSteps, tokens: plannerTokens, requires_confirmation, errorFallback, internal_steps, model, provider } = await planWithVisualAgent(goal, base64Image, elementsMap) as any;

      ws.send(JSON.stringify({
        type: 'metadata',
        metadata: { model, provider }
      }));
      if (metrics) {
        metrics.addTokens('planner', plannerTokens);
        metrics.setPlannerOutput(plannedSteps);
      }
      logger.info("WS", `Planner output: ${JSON.stringify(plannedSteps)}`);

      if (internal_steps && internal_steps.length > 0) {
        ws.send(JSON.stringify({ type: 'thoughts', thoughts: internal_steps }));
      }

      if (!plannedSteps || plannedSteps.length === 0) {
        const errReply = errorFallback || "I could not formulate a valid plan for this goal.";
        ws.send(JSON.stringify({ type: 'llm_chunk', text: errReply }));
        const errAudio = await generateTTS(errReply);
        if (errAudio && ws.readyState === ws.OPEN) ws.send(errAudio);
        saveToMemory('jarvis', errReply);
        logInteraction('voice', goal, errReply);
        ws.send(JSON.stringify({ type: 'done' }));
        state.isProcessing = false;
        if (metrics) {
          metrics.setExecutionResult(errReply);
          metrics.finalize();
        }
        return;
      }

      // C. Confirmation Gateway
      if (requires_confirmation) {
        setPendingPlanWithMetadata(plannedSteps, userText || '', 'websocket');
        const confirmMsg = `I am about to navigate to an untrusted website or perform a sensitive action. Should I proceed?`;
        saveToMemory('jarvis', confirmMsg);
        logInteraction('voice', userText, confirmMsg);

        ws.send(JSON.stringify({ type: 'llm_chunk', text: confirmMsg }));
        const confirmAudio = await generateTTS(confirmMsg);
        if (confirmAudio && ws.readyState === ws.OPEN) ws.send(confirmAudio);
        ws.send(JSON.stringify({ type: 'done' }));

        if (metrics) {
          metrics.setExecutionResult('Pending Confirmation');
          metrics.finalize();
        }
        state.isProcessing = false;
        return;
      }

      // D. Node Action Execution (SerpAPI, Scheduler)
      const nodeActions = plannedSteps.filter((s: any) => s.action === 'serp_api_search' || s.action === 'schedule_call' || s.action === 'schedule_message');
      const browserActions = plannedSteps.filter((s: any) => !['serp_api_search', 'schedule_call', 'schedule_message'].includes(s.action));

      for (const na of nodeActions) {
        if (na.action === 'serp_api_search') {
          logger.info("WS", `[TOOL] Executing SerpAPI: ${na.query}`);
          ws.send(JSON.stringify({ type: 'llm_chunk', text: `[SerpAPI] Searched for: ${na.query} ` }));
        } else if (na.action === 'schedule_call' || na.action === 'schedule_message') {
          const { jarvisScheduler } = await import('./scheduler');
          const threadId = (ws as any).threadId || "ws_client";
          const chatIdMatch = threadId.match(/tg_(\d+)/);
          const chatId = chatIdMatch ? parseInt(chatIdMatch[1]) : 0;

          const taskId = jarvisScheduler.schedule(chatId, na.action === 'schedule_call' ? 'call' : 'message', na.reason || na.text || "Scheduled task", na.delay_seconds || 0);
          logger.info("WS", `[TOOL] Scheduler registered: ${na.action} (TaskID: ${taskId}) in ${na.delay_seconds}s`);
          ws.send(JSON.stringify({ type: 'llm_chunk', text: `[Scheduler] Set timer for ${na.delay_seconds} seconds. ` }));
        }
        if (metrics) metrics.addTokens('planner', 50);
      }

      // E. Execute via Python Layer
      if (browserActions.length > 0) {
        if (process.env.USE_BROWSER_AGENT !== "true") {
          logger.info("WS", "Browser agent is disabled. Falling back to direct conversational response.");

          const fallbackNotice = `*(Notice: Browser automation is currently offline/disabled. Here is an answer based on my general knowledge)*\n\n`;
          ws.send(JSON.stringify({ type: 'llm_chunk', text: fallbackNotice }));

          const { ThreadManager } = await import("./threadManager");
          const { callChatWithCascade } = await import("./llmRouter");

          const threadId = (ws as any).threadId || "ws_client";
          const history = await ThreadManager.getHistory(threadId, 20);

          const systemPrompt = buildPrompt("voice");
          const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userText }
          ];

          const result = await callChatWithCascade(messages as any);

          ws.send(JSON.stringify({
            type: 'metadata',
            metadata: { model: result.model, provider: result.provider }
          }));

          ws.send(JSON.stringify({ type: 'llm_chunk', text: result.content }));
          const ttsAudio = await generateTTS(result.content);
          if (ttsAudio && ws.readyState === ws.OPEN) {
            ws.send(ttsAudio);
          }

          await ThreadManager.appendMessage(threadId, { role: "user", content: userText });
          await ThreadManager.appendMessage(threadId, { role: "assistant", content: result.content });

          ws.send(JSON.stringify({ type: 'done' }));
          if (metrics) {
            metrics.setExecutionResult('Success (Direct Fallback)');
            metrics.finalize();
          }
          state.isProcessing = false;
          return;
        }

        const execMsg = `Executing ${browserActions.length} step${browserActions.length > 1 ? 's' : ''}.`;
        ws.send(JSON.stringify({ type: 'llm_chunk', text: execMsg + " " }));
        const execAudio = await generateTTS(execMsg);
        if (execAudio && ws.readyState === ws.OPEN) ws.send(execAudio);

        ws.send(JSON.stringify({ type: 'browser_commands', commands: browserActions }));

        try {
          const pythonRes = await fetch('http://127.0.0.1:8000/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: browserActions })
          });
          logger.info("WS", `Python executor returned: ${pythonRes.status}`);

          const pythonData = await pythonRes.json();
          const hasFailure = pythonData.results && Array.isArray(pythonData.results) && pythonData.results.some((r: any) => r.status === 'failure');
          if (hasFailure) {
            const errors = pythonData.results.filter((r: any) => r.status === 'failure').map((r: any) => `${r.action}: ${r.details}`).join(', ');
            throw new Error(`Browser execution failed: ${errors}`);
          }
        } catch (e: any) {
          logger.error('WS', `Python agent execution failed: ${e.message}`);
          const failReply = `❌ Execution failed: ${e.message}`;
          ws.send(JSON.stringify({ type: 'llm_chunk', text: failReply }));
          const failAudio = await generateTTS(failReply);
          if (failAudio && ws.readyState === ws.OPEN) ws.send(failAudio);
          saveToMemory('jarvis', failReply);
          logInteraction('voice', userText || goal, failReply);
          ws.send(JSON.stringify({ type: 'done' }));
          if (metrics) { metrics.setExecutionResult('Failure'); metrics.finalize(); }
          state.isProcessing = false;
          return;
        }
      }

      fullResponse = "I have executed your instructions.";
      ws.send(JSON.stringify({ type: 'llm_chunk', text: fullResponse }));
      const doneAudio = await generateTTS(fullResponse);
      if (doneAudio && ws.readyState === ws.OPEN) ws.send(doneAudio);

      saveToMemory('user', userText);
      saveToMemory('jarvis', fullResponse);
      logInteraction('voice', userText, fullResponse, { browserCommands: plannedSteps });
      trackBrowserTask('voice', userText, plannedSteps);
      if (metrics) { metrics.setExecutionResult('Success'); metrics.finalize(); }
    }

  } catch (err: any) {
    if (err.message === 'AbortError') {
      logger.info('WS', 'Aborted by user.');
    } else {
      logger.error('WS', 'Pipeline error', err);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message || 'Processing failed' }));
      }
    }
  } finally {
    state.isProcessing = false;
    if (metrics) metrics.finalize();
  }
}

