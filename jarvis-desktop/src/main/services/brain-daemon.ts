import { getDecryptedConfig } from '../security/key-vault'
import { IpcMain, BrowserWindow } from 'electron'

let isBrainRunning = false

/**
 * Initializes the J.A.R.V.I.S. Core Brain (Web Server components).
 * This replaces the standalone Node.js server execution by running it 
 * directly inside the Electron Main Process.
 */
export async function startBrainDaemon() {
  if (isBrainRunning) {
    console.log('[Brain] Already running — skipping boot.')
    return
  }

  try {
    console.log('[Brain] ── Booting J.A.R.V.I.S. Neural OS ──')

    // 1. Fetch Secure Credentials
    const config = getDecryptedConfig()
    
    if (!config.JARVIS_API_KEY) {
      console.warn('[Brain] ⚠️  No API key in vault. Complete Setup Wizard first.')
      return
    }

    console.log('[Brain] ✅ Vault credentials loaded.')

    // 2. Inject credentials into process.env
    process.env.JARVIS_API_KEY = config.JARVIS_API_KEY
    process.env.GEMINI_API_KEY = config.JARVIS_API_KEY
    process.env.VITE_JARVIS_API_KEY = config.JARVIS_API_KEY
    process.env.SUPABASE_URL = config.SUPABASE_URL
    process.env.VITE_SUPABASE_URL = config.SUPABASE_URL
    process.env.SUPABASE_KEY = config.SUPABASE_ANON_KEY
    process.env.VITE_SUPABASE_KEY = config.SUPABASE_ANON_KEY
    if (config.GROQ_API_KEY) {
      process.env.GROQ_API_KEY = config.GROQ_API_KEY
    }
    process.env.ORCHESTRATOR_MODE = 'agent'

    console.log('[Brain] ✅ Environment variables injected.')

    // 3. Import backend modules dynamically
    const { logEmitter } = require('../../server/logger')
    const { McpManager } = require('../../server/mcpManager')
    const { jarvisScheduler } = require('../../server/scheduler')
    const { startTelegramBot } = require('../../server/telegramBot')
    const express = require('express')
    const http = require('http')
    const { setupWebSocketServer } = require('../../server/websocket')
    // Attempt to load apiRoutes, handling potential ES module default exports
    const apiRoutesModule = require('../../server/routes/api')
    const apiRoutes = apiRoutesModule.default || apiRoutesModule

    console.log('[Brain] ✅ Backend modules loaded.')

    // 4. Start Internal Express API & WebSocket Server
    const app = express()
    app.use(express.json())

    app.use('/api', apiRoutes)

    const server = http.createServer(app)
    setupWebSocketServer(server)

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Brain] 🌐 Internal Server running on http://localhost:${PORT}`)
    })

    // Stream logs to UI
    logEmitter.on('log', (logLine: string) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('brain:log', logLine)
      })
    })

    // Initialize MCP Manager
    McpManager.initialize().catch((e: any) => console.error('[Brain] MCP init error:', e))
    console.log('[Brain] ✅ MCP Manager initializing...')

    // Start Task Scheduler
    try {
      await jarvisScheduler.init()
      console.log('[Brain] ✅ Task Scheduler initialized.')
    } catch (e: any) {
      console.error('[Brain] ⚠️  Scheduler init error (non-fatal):', e.message)
    }

    // Start Telegram Bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        startTelegramBot()
        console.log('[Brain] ✅ Telegram Bot started.')
      } catch (e: any) {
        console.error('[Brain] ⚠️  Telegram Bot error (non-fatal):', e.message)
      }
    } else {
      console.log('[Brain] ℹ️  No Telegram token — bot skipped.')
    }

    console.log('[Brain] ✅ Agentic loop ready for user tasks.')

    isBrainRunning = true
    console.log('[Brain] ✅ J.A.R.V.I.S. Neural OS fully online!')

  } catch (error: any) {
    console.error('[Brain] ❌ Fatal boot error:', error.message)
  }
}

export function registerBrainDaemonHandlers(ipcMain: IpcMain) {
  ipcMain.handle('brain:get-status', () => {
    return isBrainRunning
  })

  ipcMain.handle('brain:get-scheduler', () => {
    try {
      const { jarvisScheduler } = require('../../server/scheduler')
      return jarvisScheduler.getAllJobs()
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('brain:get-mcp-servers', () => {
    try {
      const { McpManager } = require('../../server/mcpManager')
      // Also attach status (if it's in the client map)
      const config = McpManager.getConfig()
      return config
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('brain:add-mcp-server', async (_event, config) => {
    try {
      const { McpManager } = require('../../server/mcpManager')
      await McpManager.addServer(config)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('brain:remove-mcp-server', async (_event, id) => {
    try {
      const { McpManager } = require('../../server/mcpManager')
      await McpManager.removeServer(id)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
