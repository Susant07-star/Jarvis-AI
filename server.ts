import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Groq from "groq-sdk";
import multer from "multer";
import fs from "fs";
import * as cheerio from "cheerio";

const upload = multer({ dest: 'uploads/' });

async function performSearch(query: string) {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: string[] = [];
    $('.result__snippet').each((i, el) => {
      if (i < 3) {
        results.push($(el).text().trim());
      }
    });
    return results.length > 0 ? results.join('\n\n') : "No relevant results found.";
  } catch (e) {
    console.error("Search error:", e);
    return "Search failed due to a network error.";
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // API routes FIRST
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      
      if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: "GROQ_API_KEY is not configured. Please add it to your secrets." });
      }

      // Token management: Limit history to last 5 messages
      const recentHistory = history.slice(-5);

      // API Key Rotation: If multiple keys are provided in a comma-separated list, pick one randomly
      const apiKeys = process.env.GROQ_API_KEY.split(',').map(k => k.trim());
      const selectedApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

      const groq = new Groq({ apiKey: selectedApiKey });
      
      const messages = [
        {
          role: "system",
          content: "You are J.A.R.V.I.S., a highly advanced, highly efficient AI assistant. Speak concisely, sharply, and confidently. Address the user as 'Sir' or 'Boss'. Do not use filler words. If asked to search for something, use the search_web tool and summarize the results cleanly. If asked to open an app, play media, or run a script, use the execute_command tool. Keep responses short and impactful."
        },
        ...recentHistory.map((msg: any) => ({
          role: msg.role === 'jarvis' ? 'assistant' : 'user',
          content: msg.content
        })),
        {
          role: "user",
          content: message
        }
      ];

      const tools = [
        {
          type: "function",
          function: {
            name: "search_web",
            description: "Search the web for current events, facts, or information.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "The search query" }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "execute_command",
            description: "Execute a system command like opening an app, playing media, or running a script.",
            parameters: {
              type: "object",
              properties: {
                action: { type: "string", description: "The action to perform, e.g., 'open_app', 'play_media', 'run_script', 'fetch_info'" },
                target: { type: "string", description: "The target of the action, e.g., 'youtube', 'spotify', 'weather'" }
              },
              required: ["action", "target"]
            }
          }
        }
      ];

      // First pass: check for tool calls
      const chatCompletion = await groq.chat.completions.create({
        messages: messages as any,
        model: "llama-3.1-8b-instant",
        tools: tools as any,
        tool_choice: "auto",
        max_tokens: 1024
      });

      let responseMessage = chatCompletion.choices[0]?.message;
      
      if (responseMessage?.tool_calls) {
        const toolCall = responseMessage.tool_calls[0];
        
        if (toolCall.function.name === "execute_command") {
          const args = JSON.parse(toolCall.function.arguments);
          if (args.action === "search_web") {
            // The LLM hallucinated the action inside execute_command, treat it as search_web
            toolCall.function.name = "search_web";
            toolCall.function.arguments = JSON.stringify({ query: args.target });
          } else {
            // Return the command directly
            return res.json({ 
              command: args,
              reply: `Executing command: ${args.action} on ${args.target}, Sir.`
            });
          }
        }

        if (toolCall.function.name === "search_web") {
          const args = JSON.parse(toolCall.function.arguments);
          // Preprocess web search content
          const searchResults = await performSearch(args.query);
          
          messages.push(responseMessage as any);
          messages.push({
            role: "tool",
            content: searchResults,
            tool_call_id: toolCall.id
          } as any);

          // Second pass: stream the response with search results
          const stream = await groq.chat.completions.create({
            messages: messages as any,
            model: "llama-3.1-8b-instant",
            stream: true,
            max_tokens: 1024
          });

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          }
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // No tools called, stream the response directly
      if (!responseMessage?.tool_calls) {
        const stream = await groq.chat.completions.create({
          messages: messages as any,
          model: "llama-3.1-8b-instant",
          stream: true,
          max_tokens: 1024
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
        res.write(`data: [DONE]\n\n`);
        return res.end();
      }

    } catch (error: any) {
      console.error("Error in chat API:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to process request" });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
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

      // API Key Rotation
      const apiKeys = process.env.GROQ_API_KEY.split(',').map(k => k.trim());
      const selectedApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

      const groq = new Groq({ apiKey: selectedApiKey });
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(newPath),
        model: "whisper-large-v3",
      });

      // Clean up the file
      fs.unlinkSync(newPath);

      res.json({ text: transcription.text });
    } catch (error: any) {
      console.error("Error in transcription API:", error);
      if (req.file) {
        const ext = path.extname(req.file.originalname) || '.webm';
        const newPath = req.file.path + ext;
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: error.message || "Failed to process audio" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
