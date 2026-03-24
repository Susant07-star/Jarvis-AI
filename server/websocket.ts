import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { getGroqClient, summarizeMemory, logTokenUsage, callWithRetry } from "./llm";
import { transcribeAudio } from "./stt";
import { generateTTS } from "./tts";
import { saveToMemory, loadMemory } from "./memory";
import { jarvisTools } from "./tools";
import { performSearch } from "./search";
import { buildPrompt } from "./agent_prompts/prompt_builder";
import { logInteraction, trackBrowserTask } from "./browser/jarvisBridge";
import { logger } from "./logger";
import { MetricsTracker } from "./utils/metrics";

import { getPendingConfirmation, setPendingConfirmation, clearPendingConfirmation, hasPendingConfirmation } from "./confirmationState";

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

  wss.on('connection', (ws: WebSocket) => {
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
    const userText = await transcribeAudio(audioBuffer, groq);
    metrics = new MetricsTracker(userText || '');
    
    // Send final STT transcription back to UI so it displays immediately
    if (userText) {
      ws.send(JSON.stringify({ type: 'final', text: userText }));
    }
    
    // 0. Check Confirmation Loop
    if (hasPendingConfirmation()) {
      const pendingWs = getPendingConfirmation()!;
      const lower = userText?.toLowerCase().trim() || "";
      const confirmPhrases = ['yes', 'y', 'confirm', 'go on', 'please do it', 'do it', 'sure', 'ok'];
      const declinePhrases = ['no', 'n', 'cancel', 'stop'];
      
      if (confirmPhrases.some(p => lower === p || lower.startsWith('yes '))) {
         logger.info("Confirmation", "Approved pending WS plan");
         const plannedSteps = pendingWs.actions;
         clearPendingConfirmation();
         
         const browserActions = plannedSteps.filter((s:any) => s.action !== 'serp_api_search');
         const execMsg = `Executing confirmed steps.`;
         ws.send(JSON.stringify({ type: 'llm_chunk', text: execMsg + " " }));
         const execAudio = await generateTTS(execMsg);
         if (execAudio && ws.readyState === ws.OPEN) ws.send(execAudio);
         
         if (browserActions.length > 0) {
           ws.send(JSON.stringify({ type: 'browser_commands', commands: browserActions }));
           try {
               await fetch('http://127.0.0.1:8000/execute', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ commands: browserActions })
               });
           } catch (e: any) { logger.error('WS', `Python agent unreachable: ${e.message}`); }
         }
         
         const successReply = `Confirmed task executed.`;
         saveToMemory('user', userText || '');
         saveToMemory('jarvis', successReply);
         logInteraction('voice', userText || '', successReply, { browserCommands: plannedSteps });
         trackBrowserTask('voice', userText || '', plannedSteps);
   
         ws.send(JSON.stringify({ type: 'done' }));
         if (metrics) {
           metrics.setExecutionResult('Success via confirmation');
           metrics.finalize();
         }
         state.isProcessing = false;
         return;
      } else if (declinePhrases.some(p => lower === p || lower.startsWith('cancel '))) {
         logger.info("Confirmation", "Cancelled pending WS plan");
         clearPendingConfirmation();
         const cancelReply = "Action cancelled.";
         ws.send(JSON.stringify({ type: 'llm_chunk', text: cancelReply + " " }));
         const cancelAudio = await generateTTS(cancelReply);
         if (cancelAudio && ws.readyState === ws.OPEN) ws.send(cancelAudio);
         ws.send(JSON.stringify({ type: 'done' }));
         
         if (metrics) { metrics.setExecutionResult('Cancelled by user'); metrics.finalize(); }
         state.isProcessing = false;
         return;
      } else {
         logger.info("Confirmation", `Waiting on confirmation, received ambiguous input: "${userText}"`);
         const reprompt = "Please confirm the previous task (yes/no)";
         ws.send(JSON.stringify({ type: 'llm_chunk', text: reprompt + " " }));
         const repromptAudio = await generateTTS(reprompt);
         if (repromptAudio && ws.readyState === ws.OPEN) ws.send(repromptAudio);
         ws.send(JSON.stringify({ type: 'done' }));
         state.isProcessing = false;
         return;
      }
    }

    if (state.abortController?.signal.aborted) throw new Error('AbortError');
    
    if (!userText) {
      logger.info('WS', 'Transcription empty.');
      state.isProcessing = false;
      ws.send(JSON.stringify({ type: 'done' }));
      return;
    }
    
    ws.send(JSON.stringify({ type: 'final', text: userText }));
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

    if (decision.mode === "direct") {
      // Direct Conversational Mode
      logger.info('WS', `LLM for: "${userText}"`);
      const messages = [
        { role: "system", content: buildPrompt("browser") },
        ...compressedMemory
      ];

      const stream = await groq.chat.completions.create({
        messages: messages as any,
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 1024
      });

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
        logger.info('WS', `Stream complete: ${fullResponse.length} chars`);
        saveToMemory('jarvis', fullResponse);
        logInteraction('voice', userText, fullResponse);
        if (metrics) metrics.setExecutionResult('Direct chat complete');
        ws.send(JSON.stringify({ type: 'done' }));
      } else {
        if (metrics) metrics.setExecutionResult('Interrupted');
      }

    } else {
      // Agent Task Mode (Strict Planning -> Execution)
      const { planWithDOM } = await import("./browser/planner");
      
      // LLM start signal, but no verbose audio
      ws.send(JSON.stringify({ type: 'llm_start' }));

      // A. Extract minimal Contextual DOM
      let domMap = {};
      try {
        const pythonDomRes = await fetch('http://127.0.0.1:8000/analyze', { 
            method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }
        });
        const domData = await pythonDomRes.json();
        domMap = domData.elements || {};
      } catch(e) {
        logger.warn("WS", "Could not fetch DOM map, running blind planner");
      }

      if (state.abortController?.signal.aborted) throw new Error('AbortError');

      const goal = decision?.normalizedInput || userText;
      logger.info('WS', `Planning goal: "${goal}"`);

      if (decision?.normalizedInput && decision.normalizedInput !== userText) {
        ws.send(JSON.stringify({ type: 'llm_chunk', text: `*[Normalized Goal: ${goal}]*\n\n` }));
      }

      // B. Create Strict JSON Plan
      const { actions: plannedSteps, tokens: plannerTokens, requires_confirmation, errorFallback, internal_steps } = await planWithDOM(goal, [domMap]) as any;
      if (metrics) {
        metrics.addTokens('planner', plannerTokens);
        metrics.setPlannerOutput(plannedSteps);
      }
      logger.info("WS", `Planner output: ${JSON.stringify(plannedSteps)}`);

      if (internal_steps && internal_steps.length > 0) {
          const reasoning = internal_steps.map((s: string) => `> _${s}_`).join('\n');
          ws.send(JSON.stringify({ type: 'llm_chunk', text: `${reasoning}\n\n` }));
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
        setPendingConfirmation({ actions: plannedSteps, goal: userText || '' });
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

      // D. Node Action Execution (SerpAPI)
      const nodeActions = plannedSteps.filter((s:any) => s.action === 'serp_api_search');
      const browserActions = plannedSteps.filter((s:any) => s.action !== 'serp_api_search');

      for (const na of nodeActions) {
         logger.info("Node", `Executing SerpAPI search for: ${na.query}`);
         ws.send(JSON.stringify({ type: 'llm_chunk', text: `[SerpAPI] Searched for: ${na.query} ` }));
         if (metrics) metrics.addTokens('planner', 50);
      }

      // E. Execute via Python Layer
      if (browserActions.length > 0) {
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
        } catch (e: any) {
            logger.error('WS', `Python agent unreachable: ${e.message}`);
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
      if (metrics) metrics.setExecutionResult('Success');
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

