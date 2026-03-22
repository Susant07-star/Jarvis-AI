import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getGroqClient, summarizeMemory, logTokenUsage } from "../llm";
import { performSearch } from "../search";
import { saveToMemory, loadMemory } from "../memory";
import { jarvisTools } from "../tools";
import { buildPrompt } from "../agent_prompts/prompt_builder";

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

/**
 * Handle text-based chat interactions.
 */
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured. Please add it to your secrets." });
    }

    const groq = getGroqClient();
    const memory = loadMemory();
    const compressedMemory = await summarizeMemory(memory, groq);
    
    const messages = [
      {
        role: "system",
        content: buildPrompt("browser")
      },
      ...compressedMemory,
      {
        role: "user",
        content: message
      }
    ];
    // Agentic Loop: Allow up to 3 tool call iterations before streaming final text
    let maxTurns = 3;

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
          console.log(`[Token Metrics] Chat API Tool Check | Prompt: ${usage.prompt_tokens} | Completion: ${usage.completion_tokens} | Total: ${usage.total_tokens}`);
          logTokenUsage('browser_api_tool', usage.prompt_tokens, usage.completion_tokens);
        }
      } catch (error: any) {
        const errBody = error.error?.error || error.error || error;
        if (errBody?.code === "tool_use_failed" && errBody?.failed_generation) {
          const failedGen = errBody.failed_generation;
          const match = failedGen.match(/<function=([^=>]+)[=>](.*?)<\/function>/s);
          if (match) {
            responseMessage = {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "call_manual_" + Date.now(),
                type: "function",
                function: { name: match[1], arguments: match[2] }
              }]
            };
          } else {
            responseMessage = { role: "assistant", content: "I'm sorry, Sir. I encountered an error." };
          }
        } else {
          console.error("[Chat API] Tool check failed:", error);
          break;
        }
      }
      
      if (!responseMessage?.tool_calls) {
        break; // No tools called, proceed to stream final text
      }

      const toolCall = responseMessage.tool_calls[0];
      let args: any = {};
      try {
        if (toolCall.function.arguments) args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("[Chat API] Failed to parse tool arguments:", toolCall.function.arguments);
        break;
      }

      if (toolCall.function.name === "execute_browser_commands" || toolCall.function.name === "interact_element") {
        const commands = toolCall.function.name === "execute_browser_commands"
          ? args.commands
          : [{ type: args.action, jarvis_id: args.jarvis_id, text: args.text }];
          
        const replyText = args.confirmation_message || "On it.";
        saveToMemory('user', message);
        saveToMemory('jarvis', `[Action Executed] ${replyText}`);
        
        try {
          console.log('[Chat API] 📡 Forwarding commands to Python agent...');
          const pythonRes = await fetch('http://127.0.0.1:8000/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands })
          });
          const pythonBody = await pythonRes.text();
          console.log(`[Chat API] ✅ Python agent responded: ${pythonRes.status} — ${pythonBody}`);
        } catch (e: any) {
          console.error('[Chat API] ❌ Python agent unreachable:', e.message);
        }
        
        return res.json({ browser_commands: commands, reply: replyText });
        
      } else if (toolCall.function.name === "analyze_page") {
        console.log("[Chat API] Executing analyze_page...");
        let elementsMap = "No interactive elements found.";
        try {
          console.log('[Chat API] 📡 Requesting DOM map from Python agent...');
          const pythonRes = await fetch('http://127.0.0.1:8000/analyze', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) 
          });
          const data = await pythonRes.json();
          elementsMap = data.elements || elementsMap;
          console.log(`[Chat API] ✅ Received DOM map (${elementsMap.length} chars)`);
        } catch (e: any) {
          console.error('[Chat API] ❌ Failed to analyze page:', e.message);
          elementsMap = "Error: Could not connect to the browser agent.";
        }
        
        messages.push(responseMessage as any);
        messages.push({ role: "tool", content: elementsMap, tool_call_id: toolCall.id } as any);
        continue;
        
      } else if (toolCall.function.name === "search_web") {
        console.log("[Chat API] Executing search_web:", args.query);
        const searchResults = await performSearch(args.query || args.target, groq);
        
        messages.push(responseMessage as any);
        messages.push({ role: "tool", content: searchResults, tool_call_id: toolCall.id } as any);
        continue;
      }
      
      break;
    }

    // Stream the final response directly
      let isDisconnected = false;
      req.on('close', () => {
        isDisconnected = true;
      });

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
        res.write(`data: [DONE]\n\n`);
        return res.end();
      } else {
        // If disconnected, we might still want to save what was generated so far
        saveToMemory('user', message);
        saveToMemory('jarvis', fullResponse + ' [Interrupted]');
        return;
      }

  } catch (error: any) {
    console.error("[Chat API Error]", error);
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

export default router;
