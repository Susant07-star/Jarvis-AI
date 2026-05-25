import { IpcMain, app, clipboard, screen } from 'electron'
import http from 'http'
import { exec } from 'child_process'
import { keyboard, Key, mouse, Button, Point } from '@nut-tree-fork/nut-js'

// ── Security ────────────────────────────────────────────────────────────────
// Reads the same IRIS_API_KEY env var that J.A.R.V.I.S. uses.
// Only requests containing this Bearer token are processed.
const SECRET_TOKEN = process.env.IRIS_API_KEY || 'ironman123'

// ── App Alias Map ────────────────────────────────────────────────────────────
const APP_ALIASES: Record<string, string> = {
  vscode: 'code', code: 'code', 'visual studio code': 'code',
  terminal: 'wt', cmd: 'start cmd', powershell: 'start powershell',
  chrome: 'start chrome', edge: 'start msedge', brave: 'start brave', firefox: 'start firefox',
  whatsapp: 'start whatsapp:', discord: 'start discord:',
  spotify: 'start spotify:', telegram: 'start telegram:',
  notepad: 'notepad', calculator: 'calc', settings: 'start ms-settings:',
  explorer: 'explorer', 'task manager': 'taskmgr', taskmgr: 'taskmgr',
  word: 'start winword', excel: 'start excel', powerpoint: 'start powerpnt',
  paint: 'mspaint', vlc: 'start vlc', obs: 'start obs64',
  steam: 'start steam:',
}

// ── Key Mapping ──────────────────────────────────────────────────────────────
const KEY_MAP: Record<string, Key> = {
  enter: Key.Enter, return: Key.Enter,
  space: Key.Space,
  tab: Key.Tab,
  escape: Key.Escape, esc: Key.Escape,
  backspace: Key.Backspace,
  delete: Key.Delete, del: Key.Delete,
  ctrl: Key.LeftControl, control: Key.LeftControl,
  shift: Key.LeftShift,
  alt: Key.LeftAlt,
  win: Key.LeftSuper, windows: Key.LeftSuper, super: Key.LeftSuper,
  a: Key.A, b: Key.B, c: Key.C, d: Key.D, e: Key.E, f: Key.F,
  g: Key.G, h: Key.H, i: Key.I, j: Key.J, k: Key.K, l: Key.L,
  m: Key.M, n: Key.N, o: Key.O, p: Key.P, q: Key.Q, r: Key.R,
  s: Key.S, t: Key.T, u: Key.U, v: Key.V, w: Key.W, x: Key.X,
  y: Key.Y, z: Key.Z,
  f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4,
  f5: Key.F5, f6: Key.F6, f7: Key.F7, f8: Key.F8,
  f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
  up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
  home: Key.Home, end: Key.End, pageup: Key.PageUp, pagedown: Key.PageDown,
  '0': Key.Num0, '1': Key.Num1, '2': Key.Num2, '3': Key.Num3, '4': Key.Num4,
  '5': Key.Num5, '6': Key.Num6, '7': Key.Num7, '8': Key.Num8, '9': Key.Num9,
}

// ── Action Router ────────────────────────────────────────────────────────────
async function routeAction(action: string, payload: any): Promise<{ success: boolean; message: string; data?: any }> {
  console.log(`[I.R.I.S. Bridge] ▶ Action: "${action}" | Payload: ${JSON.stringify(payload)}`)
  try {
    switch (action) {

      // ── PING ──
      case 'ping':
        return { success: true, message: 'I.R.I.S. online. All systems nominal.' }

      // ── OPEN APP ──
      case 'open_app': {
        const appName: string = payload.appName || payload.app || ''
        const command = APP_ALIASES[appName.toLowerCase().trim()]
        return await new Promise((resolve) => {
          const cmd = command || appName
          exec(cmd, (err) => {
            if (err) {
              // Fallback: PowerShell Start-Apps search
              exec(
                `powershell -Command "Get-StartApps | Where-Object { $_.Name -like '*${appName}*' } | Select-Object -First 1 -ExpandProperty AppID"`,
                (e2, stdout) => {
                  if (!e2 && stdout.trim()) {
                    exec(`start explorer "shell:AppsFolder\\${stdout.trim()}"`, (e3) => {
                      if (e3) resolve({ success: false, message: `Cannot open ${appName}: ${e3.message}` })
                      else resolve({ success: true, message: `Opened ${appName} via System Search.` })
                    })
                  } else {
                    resolve({ success: false, message: `App '${appName}' not found on this PC.` })
                  }
                }
              )
            } else {
              resolve({ success: true, message: `Opened ${appName}.` })
            }
          })
        })
      }

      // ── CLOSE APP ──
      case 'close_app': {
        const processName = (payload.appName || payload.app || '').trim()
        const exe = processName.endsWith('.exe') ? processName : `${processName}.exe`
        return await new Promise((resolve) => {
          exec(`taskkill /IM "${exe}" /F /T`, (err) => {
            if (err) resolve({ success: false, message: `Could not close ${processName}. Is it running?` })
            else resolve({ success: true, message: `Closed ${processName}.` })
          })
        })
      }

      // ── PHANTOM TYPE (clipboard inject — fast, handles any character) ──
      case 'phantom_type':
      case 'type_text': {  // type_text is an alias for phantom_type
        const text: string = payload.text || ''
        if (!text) return { success: false, message: 'No text provided to type.' }
        const old = clipboard.readText()
        clipboard.writeText(text)
        await new Promise(r => setTimeout(r, 100))
        await keyboard.pressKey(Key.LeftControl, Key.V)
        await keyboard.releaseKey(Key.V, Key.LeftControl)
        await new Promise(r => setTimeout(r, 150))
        clipboard.writeText(old) // Restore clipboard
        return { success: true, message: `Typed ${text.length} characters via clipboard injection.` }
      }

      // ── PRESS HOTKEY (accepts string "ctrl+s" OR array ["ctrl","s"]) ──
      case 'press_key':    // single key string alias
      case 'press_keys': { // array format
        let keys: string[]
        if (action === 'press_key' || typeof payload.key === 'string') {
          // parse "ctrl+s" or "win+d" etc.
          const keyStr: string = payload.key || payload.keys || ''
          keys = keyStr.toLowerCase().split('+').map((k: string) => k.trim())
        } else {
          keys = payload.keys || []
        }
        const mappedKeys = keys.map((k: string) => KEY_MAP[k.toLowerCase()]).filter(Boolean)
        if (mappedKeys.length === 0) return { success: false, message: `Unknown keys: ${keys.join('+')}. Known keys: ctrl, shift, alt, win, a-z, f1-f12, enter, space, tab, escape, up, down, left, right` }
        for (const k of mappedKeys) await keyboard.pressKey(k)
        for (const k of mappedKeys.slice().reverse()) await keyboard.releaseKey(k)
        return { success: true, message: `Pressed ${keys.join('+')}` }
      }

      // ── SCREENSHOT ──
      case 'screenshot': {
        const { desktopCapturer } = await import('electron')
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 }
        })
        const primary = sources[0]
        if (!primary) return { success: false, message: 'No screen source found for screenshot.' }
        const img = primary.thumbnail
        const png = img.toPNG()
        const base64 = png.toString('base64')
        return {
          success: true,
          message: `Screenshot captured (${img.getSize().width}x${img.getSize().height}).`,
          data: { base64, mimeType: 'image/png', width: img.getSize().width, height: img.getSize().height }
        }
      }

      // ── CLICK SCREEN ──
      case 'click_screen': {
        const { x, y, doubleClick } = payload
        const primaryDisplay = screen.getPrimaryDisplay()
        const scaleFactor = primaryDisplay.scaleFactor
        const endPoint = new Point(Math.round(x / scaleFactor), Math.round(y / scaleFactor))
        const startPoint = await mouse.getPosition()
        // Human-like bezier curve movement
        const steps = 20
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          await mouse.move([new Point(
            Math.round((1-t)*startPoint.x + t*endPoint.x),
            Math.round((1-t)*startPoint.y + t*endPoint.y)
          )])
        }
        if (doubleClick) await mouse.doubleClick(Button.LEFT)
        else await mouse.leftClick()
        return { success: true, message: `Clicked at (${x}, ${y}).` }
      }

      // ── SCROLL ──
      case 'scroll': {
        const amount = payload.amount || 500
        if (payload.direction === 'up') await mouse.scrollUp(amount)
        else await mouse.scrollDown(amount)
        return { success: true, message: `Scrolled ${payload.direction}.` }
      }

      // ── RUN SHELL COMMAND ──
      case 'run_command': {
        const cmd: string = payload.command || ''
        if (!cmd) return { success: false, message: 'No command provided.' }
        return await new Promise((resolve) => {
          exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
            if (err) resolve({ success: false, message: `Command failed: ${stderr || err.message}` })
            else resolve({ success: true, message: (stdout || 'Command executed.').substring(0, 1000) })
          })
        })
      }

      // ── GET MOUSE POSITION ──
      case 'get_mouse_position': {
        const pos = await mouse.getPosition()
        return { success: true, message: `Mouse is at (${pos.x}, ${pos.y}).`, data: pos }
      }

      // ── GET SCREEN SIZE ──
      case 'get_screen_info': {
        const d = screen.getPrimaryDisplay()
        return {
          success: true,
          message: `Screen: ${d.workAreaSize.width}x${d.workAreaSize.height} (scale: ${d.scaleFactor}x)`,
          data: d.workAreaSize
        }
      }

      // ── ADB (Android phone control) ──
      case 'adb_command': {
        const adbArgs: string = payload.adbArgs || ''
        return await new Promise((resolve) => {
          exec(`adb ${adbArgs}`, { timeout: 8000 }, (err, stdout) => {
            if (err) resolve({ success: false, message: `ADB failed: ${err.message}` })
            else resolve({ success: true, message: `ADB: ${stdout || 'OK'}` })
          })
        })
      }

      default:
        return {
          success: false,
          message: `Unknown action '${action}'. Valid actions: open_app, close_app, type_text, phantom_type, press_key, press_keys, click_screen, scroll, screenshot, run_command, get_mouse_position, get_screen_info, adb_command, ping`
        }
    }
  } catch (err: any) {
    console.error(`[I.R.I.S. Bridge] ❌ Action "${action}" threw:`, err)
    return { success: false, message: `I.R.I.S. action error: ${err.message}` }
  }
}

// ── HTTP Daemon ──────────────────────────────────────────────────────────────
export default function registerApiBridge({ ipcMain }: { ipcMain: IpcMain }) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // ── Auth Check ──
    const authHeader = req.headers['authorization']
    if (!authHeader || authHeader !== `Bearer ${SECRET_TOKEN}`) {
      console.warn(`[I.R.I.S. Daemon] 🔐 Unauthorized request from ${req.socket.remoteAddress}`)
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Unauthorized.' }))
      return
    }

    // ── Health Check ──
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, message: 'I.R.I.S. online.', version: app.getVersion() }))
      return
    }

    // ── Capabilities ──
    if (req.method === 'GET' && req.url === '/capabilities') {
      const caps = {
        actions: ['open_app', 'close_app', 'type_text', 'phantom_type', 'press_key', 'press_keys',
                  'click_screen', 'scroll', 'screenshot', 'run_command',
                  'get_mouse_position', 'get_screen_info', 'adb_command', 'ping'],
        version: app.getVersion(),
        status: 'online'
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(caps))
      return
    }

    // ── Execute Command ──
    if (req.method === 'POST' && req.url === '/execute') {
      let body = ''
      req.on('data', chunk => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body)
          const { action, ...rest } = payload
          const result = await routeAction(action, rest)
          console.log(`[I.R.I.S. Bridge] ◀ Result for "${action}": success=${result.success} | ${result.message}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e: any) {
          console.error(`[I.R.I.S. Bridge] ❌ Parse error:`, e)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: `Bad request: ${e.message}` }))
        }
      })
      return
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ success: false, error: 'Not Found' }))
      return
    }

  })

  const PORT = 4000
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[I.R.I.S. Daemon] 🟢 Listening on http://0.0.0.0:${PORT}`)
    console.log(`[I.R.I.S. Daemon] 🛡️  Bearer token active. Ready for J.A.R.V.I.S. commands.`)
    console.log(`[I.R.I.S. Daemon] ⚡ Actions: open_app, close_app, type_text, press_key, screenshot, click_screen, scroll, run_command, adb_command`)
  })

  server.on('error', (err) => {
    console.error(`[I.R.I.S. Daemon] ❌ Failed to start: ${err.message}`)
  })
}
