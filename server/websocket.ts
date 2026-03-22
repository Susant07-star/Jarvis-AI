import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { getGroqClient, summarizeMemory, logTokenUsage } from "./llm";
import { transcribeAudio } from "./stt";
import { generateTTS } from "./tts";
import { saveToMemory, loadMemory } from "./memory";
import { jarvisTools } from "./tools";
import { performSearch } from "./search";
import { buildPrompt } from "./agent_prompts/prompt_builder";

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
    console.log('[WebSocket] New connection established');
    
    const state: ConnectionState = {
      audioBuffer: [],
      isProcessing: false,
      isSpeaking: false,
      abortController: null
    };

    ws.on('message', async (message: Buffer | string) => {
      try {
        if (Buffer.isBuffer(message)) {
          // Accumulate audio chunks
          state.audioBuffer.push(message);
          // Keep only the last 4 chunks (approx 1 second) of silence before speech starts
          if (!state.isSpeaking && state.audioBuffer.length > 4) {
            state.audioBuffer.shift();
          }
        } else {
          // Handle JSON commands
          let data;
          try {
            data = JSON.parse(message.toString());
          } catch (e) {
            console.warn('[WebSocket] Received invalid JSON:', message.toString());
            return;
          }
          
          if (data.type === 'speech_start') {
            state.isSpeaking = true;
            
            if (state.isProcessing && state.abortController) {
              console.log('[WebSocket] User interrupted. Aborting current generation.');
              state.abortController.abort();
              state.abortController = null;
              state.isProcessing = false;
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          } else if (data.type === 'speech_end') {
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
  console.log(`[WebSocket] Received speech_end event. Processing ${audioBuffer.length} chunks.`);
  
  if (audioBuffer.length === 0) {
    console.log('[WebSocket] Audio buffer empty. Sending done.');
    ws.send(JSON.stringify({ type: 'done' }));
    return;
  }
  
  state.isProcessing = true;
  ws.send(JSON.stringify({ type: 'processing' }));
  
  try {
    const groq = getGroqClient();
    
    // 1. STT: Transcribe
    const userText = await transcribeAudio(audioBuffer, groq);
    
    if (state.abortController?.signal.aborted) throw new Error('AbortError');
    
    if (!userText) {
      console.log('[WebSocket] Transcription empty. Sending done.');
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
    console.log(`[WebSocket] Initiating LLM for: "${userText}"`);
    console.log(`[WebSocket] Memory has ${memory.length} entries`);
    const messages = [
      {
        role: "system",
        content: buildPrompt("browser")
      },
      ...compressedMemory
    ];

    // Agentic Loop: Allow up to 3 tool call iterations before streaming final text
    let maxTurns = 3;
    let streamFinalResponse = true;

    while (maxTurns > 0) {
      maxTurns--;
      let responseMessage: any;
      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: messages as any,
          model: "llama-3.3-70b-versatile",
          tools: jarvisTools as any,
          tool_choice: "auto",
          max_tokens: 1024
        });
        responseMessage = chatCompletion.choices[0]?.message;
        
        // Log token usage for observability
        const usage = chatCompletion.usage;
        if (usage) {
          console.log(`[Token Metrics] Tool Check | Prompt: ${usage.prompt_tokens} | Completion: ${usage.completion_tokens} | Total: ${usage.total_tokens}`);
          logTokenUsage('browser_websocket_tool', usage.prompt_tokens, usage.completion_tokens);
        }
      } catch (error: any) {
        console.error("[WebSocket] Tool check failed:", error);
        break;
      }
      
      if (state.abortController?.signal.aborted) throw new Error('AbortError');

      console.log('[WebSocket] LLM response - tool_calls:', responseMessage?.tool_calls ? JSON.stringify(responseMessage.tool_calls) : 'NONE');

      if (!responseMessage?.tool_calls) {
        // No tools called, break the loop and proceed to stream text
        break;
      }

      const toolCall = responseMessage.tool_calls[0];
      let args: any = {};
      try {
        if (toolCall.function.arguments) {
          args = JSON.parse(toolCall.function.arguments);
        }
      } catch (e) {
        console.error("[WebSocket] Failed to parse tool arguments:", toolCall.function.arguments);
        break;
      }

      if (toolCall.function.name === "execute_browser_commands" || toolCall.function.name === "interact_element") {
        console.log(`[WebSocket] ✅ TOOL CALLED: ${toolCall.function.name}`);
        
        const commands = toolCall.function.name === "execute_browser_commands" 
          ? args.commands 
          : [{ type: args.action, jarvis_id: args.jarvis_id, text: args.text }];
          
        const confirmationText = args.confirmation_message || "On it.";
        
        ws.send(JSON.stringify({ type: 'llm_start' }));
        ws.send(JSON.stringify({ type: 'llm_chunk', text: confirmationText }));
        
        const audioBuf = await generateTTS(confirmationText);
        if (state.abortController?.signal.aborted) throw new Error('AbortError');
        
        if (audioBuf && ws.readyState === ws.OPEN) {
          ws.send(audioBuf);
        }
        
        ws.send(JSON.stringify({ type: 'browser_commands', commands }));
        
        // Forward to Python agent
        try {
          console.log('[WebSocket] 📡 Sending POST to Python agent...');
          const pythonRes = await fetch('http://127.0.0.1:8000/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands })
          });
          const pythonBody = await pythonRes.text();
          console.log(`[WebSocket] ✅ Python agent responded: ${pythonRes.status} — ${pythonBody}`);
        } catch (e: any) {
          console.error('[WebSocket] ❌ FAILED to reach Python agent:', e.message);
        }

        saveToMemory('jarvis', `[Action Executed] ${confirmationText}`);
        ws.send(JSON.stringify({ type: 'done' }));
        state.isProcessing = false;
        streamFinalResponse = false;
        return; // Exit completely
        
      } else if (toolCall.function.name === "analyze_page") {
        console.log("[WebSocket] Executing analyze_page");
        let elementsMap = "No interactive elements found.";
        try {
          console.log('[WebSocket] 📡 Requesting DOM map from Python agent...');
          const pythonRes = await fetch('http://127.0.0.1:8000/analyze', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) 
          });
          const data = await pythonRes.json();
          elementsMap = data.elements || elementsMap;
          console.log(`[WebSocket] ✅ Received DOM map (${elementsMap.length} chars)`);
        } catch (e: any) {
          console.error('[WebSocket] ❌ Failed to analyze page:', e.message);
          elementsMap = "Error: Could not connect to the browser agent.";
        }
        
        if (state.abortController?.signal.aborted) throw new Error('AbortError');
        
        messages.push(responseMessage as any);
        messages.push({
          role: "tool",
          content: elementsMap,
          tool_call_id: toolCall.id
        } as any);
        
        // Loop continues, allowing LLM to see the map and call interact_element
        continue;
        
      } else if (toolCall.function.name === "search_web") {
        console.log("[WebSocket] Executing search_web:", args.query);
        const searchResults = await performSearch(args.query, groq);
        
        if (state.abortController?.signal.aborted) throw new Error('AbortError');
        
        messages.push(responseMessage as any);
        messages.push({
          role: "tool",
          content: searchResults,
          tool_call_id: toolCall.id
        } as any);
        saveToMemory('jarvis', `[Search Executed Successfully] I found the following information: ${searchResults}`);
        
        // Loop continues
        continue;
      }
      
      // Safety break if unknown tool
      break;
    }

    if (!streamFinalResponse) return;

    // Stream the final response
    const stream = await groq.chat.completions.create({
      messages: messages as any,
      model: "llama-3.3-70b-versatile",
      stream: true,
      max_tokens: 1024
    });

    let fullResponse = '';
    let sentenceBuffer = '';

    ws.send(JSON.stringify({ type: 'llm_start' }));

    for await (const chunk of stream) {
      if (state.abortController?.signal.aborted) throw new Error('AbortError');
      
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        sentenceBuffer += content;
        
        // Send text chunk to frontend for live display
        ws.send(JSON.stringify({ type: 'llm_chunk', text: content }));
        
        // 4. TTS: Sentence boundary detection
        let sentenceMatch;
        while ((sentenceMatch = sentenceBuffer.match(/.*?[.!?]+(?=\s|$)/))) {
          const sentence = sentenceMatch[0];
          sentenceBuffer = sentenceBuffer.substring(sentence.length).trimStart();
          
          // Generate and send TTS audio
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
      console.log(`[WebSocket] LLM stream complete. Generated ${fullResponse.length} chars.`);
      saveToMemory('jarvis', fullResponse);
      ws.send(JSON.stringify({ type: 'done' }));
    }
    
  } catch (err: any) {
    if (err.message === 'AbortError') {
      console.log('[WebSocket] Processing aborted by user interruption.');
    } else {
      console.error("[WebSocket Pipeline Error]", err);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message || 'Processing failed' }));
      }
    }
  } finally {
    state.isProcessing = false;
  }
}

