import { getDecryptedConfig } from '../security/key-vault'

let isBrainRunning = false

/**
 * Initializes the J.A.R.V.I.S. Core Brain (Web Server components).
 * This replaces the standalone Node.js server execution by running it 
 * directly inside the Electron Main Process.
 */
export async function startBrainDaemon() {
  if (isBrainRunning) {
    console.log('[J.A.R.V.I.S. Brain] Brain is already running.')
    return
  }

  try {
    console.log('[J.A.R.V.I.S. Brain] Booting neural pathways...')

    // 1. Fetch Secure Credentials
    const config = getDecryptedConfig()
    
    if (!config.JARVIS_API_KEY) {
      console.warn('[J.A.R.V.I.S. Brain] No API key found. Neural boot aborted.')
      return
    }

    // 2. Inject credentials into process.env so legacy server code can read them
    process.env.JARVIS_API_KEY = config.JARVIS_API_KEY
    process.env.GEMINI_API_KEY = config.JARVIS_API_KEY // Legacy fallback
    process.env.VITE_JARVIS_API_KEY = config.JARVIS_API_KEY
    process.env.SUPABASE_URL = config.SUPABASE_URL
    process.env.VITE_SUPABASE_URL = config.SUPABASE_URL
    process.env.SUPABASE_KEY = config.SUPABASE_ANON_KEY
    process.env.VITE_SUPABASE_KEY = config.SUPABASE_ANON_KEY

    // Ensure some default configs for the backend
    process.env.NODE_ENV = 'production'
    process.env.ORCHESTRATOR_MODE = 'agent'

    // 3. Import backend modules dynamically
    // Dynamic import ensures we only load backend modules AFTER env vars are set.
    const { startTelegramBot } = require('../../server/telegramBot')
    const { runAutonomousLoop } = require('../../server/agenticLoop')
    const { jarvisScheduler } = require('../../server/scheduler')
    
    // Start Telegram Bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
      startTelegramBot()
    }

    // Start Task Scheduler
    jarvisScheduler.start()

    // Start Agentic Background Loop
    // (We wrap it in a setTimeout so it doesn't block the main thread boot)
    setTimeout(() => {
       runAutonomousLoop().catch(e => console.error('[J.A.R.V.I.S. Brain] Loop Error:', e))
    }, 5000)

    isBrainRunning = true
    console.log('[J.A.R.V.I.S. Brain] Neural OS successfully booted.')

  } catch (error) {
    console.error('[J.A.R.V.I.S. Brain] Fatal Neural Error during boot:', error)
  }
}
