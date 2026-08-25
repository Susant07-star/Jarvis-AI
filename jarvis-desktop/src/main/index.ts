// Load .env before anything else so process.env is populated
import dotenv from 'dotenv'
import path, { join } from 'path'
dotenv.config({ path: join(process.cwd(), '.env') })

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  session,
  safeStorage,
  systemPreferences,
  dialog
} from 'electron'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import registerIpcHandlers from './logic/iris-memory-save'
import registerSystemHandlers from './logic/get-system-info'
import registerFileSearch from './logic/file-search'
import registerFileOps from './logic/file-ops'
import registerFileWrite from './logic/file-write'
import registerFileRead from './logic/file-read'
import registerFileOpen from './logic/file-open'
import registerDirLoader from './logic/dir-load'
import registerFileScanner from './logic/file-launcher'
import registerAppLauncher from './logic/app-launcher'
import registerNotesHandlers from './logic/notes-manager'
import registerWebAgent from './logic/web-agent'
import registerGhostControl from './logic/ghost-control'
import registerterminalControl from './logic/terminal-control'
import registerGalleryHandlers from './logic/gallery-manager'
import registerGmailHandlers from './logic/gmail-manager'
import registerLocationHandlers from './logic/live-location'
import registerAdbHandlers from './logic/adb-manager'
import registerRealityHacker from './logic/reality-hacker'
import registerIrisCoder from './services/iris-coder'
import registerTelekinesis from './logic/telekinesis'
import registerPermanentMemory from './logic/permanent-memory'
import registerWormhole, { autoStartWormhole } from './services/wormhole'
import registerOracle from './services/RAG-oracle'
import registerDeepResearch from './services/deep-research'
import registerWidgetMaker from './auto/widget-manager'
import registerWebsiteBuilder from './auto/website-builder'
import registerWorkflowManager from './workflow/workflow-manager'
import registerApiBridge from './services/api-bridge'
import registerDropZoneControl from './handlers/SmartDropZone-Handler'
import registerScreenPeeler from './handlers/ScreenPeeler-handler'
import registerPhantomKeyboard from './handlers/PhantomControl-handler'
import registerSecurityVault from './security/Security'
import registerLockSystem from './security/lock-system'
import { registerLicenseHandlers } from './security/license-manager'
import { registerKeyVaultHandlers } from './security/key-vault'
import { startBrainDaemon, registerBrainDaemonHandlers } from './services/brain-daemon'
import { autoUpdater } from 'electron-updater'

app.commandLine.appendSwitch('use-fake-ui-for-media-stream')

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('iris', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('iris')
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let isOverlayMode = false

const secureConfigPath = join(app.getPath('userData'), 'iris_secure_vault.json')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  ipcMain.on('window-min', () => mainWindow?.minimize())
  ipcMain.on('window-close', () => mainWindow?.close())
  ipcMain.on('window-max', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.on('console-log', (_event, message) => {
    console.log('\x1b[36m[J.A.R.V.I.S. FRONTEND]\x1b[0m', message)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', (event, commandLine) => {
  if (!event) {
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const url = commandLine.find((arg) => arg.startsWith('iris://'))
    if (url) {
      mainWindow.webContents.send('oauth-callback', url)
    }
  }
})

function toggleOverlayMode() {
  if (!mainWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  if (isOverlayMode) {
    mainWindow.setResizable(true)
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setBounds({ width: 950, height: 670 })
    mainWindow.center()
    mainWindow.webContents.send('overlay-mode', false)
  } else {
    const w = 340
    const h = 70
    mainWindow.setBounds({
      width: w,
      height: h,
      x: Math.floor(width / 2 - w / 2),
      y: height - h - 50
    })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setResizable(false)
    mainWindow.webContents.send('overlay-mode', true)
  }
  isOverlayMode = !isOverlayMode
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Found',
        message: `Neural Core Update Found: v${info.version}. Downloading in background...`
      })
    })

    autoUpdater.on('error', (err) => {
      console.warn('Auto-updater error (non-fatal):', err?.message || err)
    })

    autoUpdater.on('update-downloaded', () => {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Update Ready',
          message: 'New version downloaded! The system will now force reboot to apply the patch.',
          buttons: ['Execute Restart']
        })
        .then(() => {
          setImmediate(() => {
            app.removeAllListeners('window-all-closed')
            autoUpdater.quitAndInstall(false, true)
          })
        })
    })

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('checkForUpdatesAndNotify failed (non-fatal):', err?.message)
    })
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = [
      'media',
      'audioCapture',
      'videoCapture',
      'desktopVideoCapture',
      'microphone',
      'camera'
    ]
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = [
      'media',
      'audioCapture',
      'videoCapture',
      'desktopVideoCapture',
      'microphone',
      'camera'
    ]
    return allowedPermissions.includes(permission)
  })

  if (process.platform === 'darwin') {
    if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
      systemPreferences.askForMediaAccess('microphone')
    }
    if (systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
      systemPreferences.askForMediaAccess('camera')
    }
  }

  ipcMain.handle('secure-save-keys', async (_, { groqKey, geminiKey }) => {
    try {
      let groqEncrypted, geminiEncrypted

      if (safeStorage.isEncryptionAvailable()) {
        groqEncrypted = safeStorage.encryptString(groqKey).toString('base64')
        geminiEncrypted = safeStorage.encryptString(geminiKey).toString('base64')
      } else {
        groqEncrypted = Buffer.from(groqKey).toString('base64')
        geminiEncrypted = Buffer.from(geminiKey).toString('base64')
      }

      const secureData = {
        groq: groqEncrypted,
        gemini: geminiEncrypted
      }

      fs.writeFileSync(secureConfigPath, JSON.stringify(secureData))
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('secure-get-keys', async () => {
    // Try the new vault first (used by the Setup Wizard)
    try {
      const { getDecryptedConfig } = require('./security/key-vault')
      const vaultConfig = getDecryptedConfig()
      if (vaultConfig?.JARVIS_API_KEY) {
        return {
          geminiKey: vaultConfig.JARVIS_API_KEY,
          groqKey: vaultConfig.GROQ_API_KEY || ''
        }
      }
    } catch { /* fall through to legacy store */ }

    // Fall back to the legacy key store
    if (!fs.existsSync(secureConfigPath)) return null
    try {
      const data = JSON.parse(fs.readFileSync(secureConfigPath, 'utf8'))
      let groqKey, geminiKey

      if (safeStorage.isEncryptionAvailable()) {
        groqKey = data.groq ? safeStorage.decryptString(Buffer.from(data.groq, 'base64')) : ''
        geminiKey = data.gemini ? safeStorage.decryptString(Buffer.from(data.gemini, 'base64')) : ''
      } else {
        groqKey = data.groq ? Buffer.from(data.groq, 'base64').toString('utf8') : ''
        geminiKey = data.gemini ? Buffer.from(data.gemini, 'base64').toString('utf8') : ''
      }

      return { groqKey, geminiKey }
    } catch (err) {
      return null
    }
  })

  ipcMain.handle('check-keys-exist', () => {
    return fs.existsSync(secureConfigPath)
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('check-for-updates', async () => {
    if (is.dev) return { message: 'Updates disabled in dev mode.' }
    try {
      await autoUpdater.checkForUpdatesAndNotify()
      return { message: 'Update check initiated.' }
    } catch (err: any) {
      return { message: err?.message || 'Update check failed.' }
    }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['content-security-policy']
    delete responseHeaders['x-content-security-policy']
    delete responseHeaders['access-control-allow-origin']

    callback({
      responseHeaders,
      statusLine: details.statusLine
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow && url.startsWith('iris://')) {
      mainWindow.webContents.send('oauth-callback', url)
    }
  })

  registerLockSystem()
  registerSecurityVault()
  registerLicenseHandlers()
  registerKeyVaultHandlers()
  registerBrainDaemonHandlers(ipcMain)
  registerPhantomKeyboard()
  registerScreenPeeler()
  registerDropZoneControl(ipcMain)
  registerWorkflowManager()
  registerWebsiteBuilder()
  registerWidgetMaker()
  registerDeepResearch({ ipcMain })
  registerOracle({ ipcMain })
  registerWormhole({ ipcMain })
  registerPermanentMemory({ ipcMain, app })
  registerTelekinesis({ ipcMain })
  registerIrisCoder({ ipcMain, app })
  registerRealityHacker(ipcMain)
  registerAdbHandlers(ipcMain)
  registerLocationHandlers(ipcMain)
  registerApiBridge({ ipcMain })
  registerGmailHandlers(ipcMain)
  registerGalleryHandlers(ipcMain)
  registerterminalControl(ipcMain)
  registerGhostControl(ipcMain)
  registerWebAgent(ipcMain)
  registerNotesHandlers(ipcMain)
  registerAppLauncher(ipcMain)
  registerDirLoader(ipcMain)
  registerFileOpen(ipcMain)
  registerFileSearch(ipcMain)
  registerFileRead(ipcMain)
  registerFileWrite(ipcMain)
  registerFileOps(ipcMain)
  registerFileScanner(ipcMain)
  registerSystemHandlers(ipcMain)
  registerIpcHandlers({ ipcMain, app })

  ipcMain.handle('get-screen-source', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources[0]?.id
  })

  createWindow()

  // Auto-start Cloudflare tunnel to expose local port 4000 for J.A.R.V.I.S. Uplink
  autoStartWormhole(4000)

  globalShortcut.register('CommandOrControl+Shift+I', () => toggleOverlayMode())
  ipcMain.on('toggle-overlay', () => toggleOverlayMode())

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Boot Neural OS if already configured
  const StoreClass = (require('electron-store') as any).default || require('electron-store')
  const store = new StoreClass({ name: 'jarvis_secure_vault' })
  if (store.get('JARVIS_API_KEY')) {
    startBrainDaemon()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
