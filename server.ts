import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import http from "http";
import apiRoutes from "./server/routes/api";
import { setupWebSocketServer } from "./server/websocket";
import { startTelegramBot } from "./server/telegramBot";
import { jarvisScheduler } from "./server/scheduler";
import { startVoiceEngineHeartbeat } from "./server/voice_bridge";

import { logger } from "./server/logger";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // ── Global API Telemetry Logging ──
  app.use((req, res, next) => {
    // Don't spam the logs with the telemetry endpoint itself, or assets
    if (req.path.startsWith('/api/') && req.path !== '/api/logs/raw' && req.path !== '/api/butler/results' && req.path !== '/api/tasks') {
      logger.info('API', `[${req.method}] ${req.originalUrl}`);
    }
    next();
  });

  // ── Global Security Enforcement ──
  app.get("/api/config/auth", (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
      ownerEmail: process.env.OWNER_EMAIL
    });
  });

  app.use("/api", (req, res, next) => {
    // Skip PIN check for the auth config endpoint so frontend can load login screen
    if (req.path === '/config/auth') return next();

    const requiredPin = process.env.JARVIS_PIN;
    if (requiredPin) {
      const providedPin = req.headers['x-jarvis-pin'] || req.query.pin;
      if (providedPin !== requiredPin) {
        return res.status(401).json({ error: "Unauthorized: Invalid Master PIN." });
      }
    }
    next();
  });

  // Mount modular API routes
  app.use("/api", apiRoutes);

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

  // Global error handler to ensure JSON responses for API errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Global Error Handler]', err);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    } else {
      next(err);
    }
  });

  const server = http.createServer(app);
  
  // Setup WebSocket server for real-time voice interaction
  setupWebSocketServer(server);

  // Start Telegram bot (non-blocking, runs in background)
  startTelegramBot();

  // Initialize Scheduler from Supabase
  await jarvisScheduler.init();

  // Start Hugging Face Voice Engine Heartbeat
  startVoiceEngineHeartbeat();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
