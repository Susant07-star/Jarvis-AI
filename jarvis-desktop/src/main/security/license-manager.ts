import { ipcMain, app } from 'electron'
import crypto from 'crypto'
import os from 'os'
import fs from 'fs'
import path from 'path'

// ─── License Storage Path ────────────────────────────────────────────────────
const LICENSE_FILE = path.join(app.getPath('userData'), 'jarvis_license.json')

// ─── Generate a stable Hardware ID from machine properties ──────────────────
function getHardwareId(): string {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown-cpu',
    os.totalmem().toString()
  ].join('|')

  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32)
}

// ─── Load saved license from disk ───────────────────────────────────────────
function loadLicense(): { key: string; hwid: string } | null {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null
    const raw = fs.readFileSync(LICENSE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ─── Save license to disk ────────────────────────────────────────────────────
function saveLicense(key: string, hwid: string): void {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({ key, hwid }, null, 2), 'utf-8')
}

// ─── Verify license with the validation server ──────────────────────────────
async function verifyWithServer(
  key: string,
  hwid: string
): Promise<{ valid: boolean; message: string }> {
  // ── DEV BYPASS ────────────────────────────────────────────────────────────
  // In development (npm run dev) or when explicitly set, skip the server call.
  if (process.env.NODE_ENV === 'development' || process.env.JARVIS_DEV_BYPASS === 'true') {
    console.warn('[J.A.R.V.I.S. License] DEV MODE: License check bypassed.')
    return { valid: true, message: 'Development bypass active.' }
  }

  try {
    const VALIDATION_URL = process.env.JARVIS_LICENSE_URL || 'https://jarvis-license.vercel.app/api/validate'

    const response = await fetch(VALIDATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hwid }),
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) {
      return { valid: false, message: 'License server error. Please try again.' }
    }

    const data = (await response.json()) as { valid: boolean; message: string }
    return data
  } catch (err: any) {
    return { valid: false, message: `Could not reach license server: ${err.message}` }
  }
}

// ─── IPC Handlers (called by renderer LicenseGate.tsx) ──────────────────────
export function registerLicenseHandlers(): void {
  // Check if already licensed on this machine
  ipcMain.handle('license:check', async () => {
    const hwid = getHardwareId()

    // ── DEV BYPASS: skip license gate entirely in development ──
    if (process.env.NODE_ENV === 'development' || process.env.JARVIS_DEV_BYPASS === 'true') {
      console.warn('[J.A.R.V.I.S. License] DEV MODE: License check bypassed.')
      return { status: 'licensed', hwid, key: 'DEV-BYPASS' }
    }

    const saved = loadLicense()
    if (!saved) return { status: 'unlicensed', hwid }

    // License file exists — re-verify HWID matches (anti-copy protection)
    if (saved.hwid !== hwid) {
      return { status: 'hwid_mismatch', hwid }
    }

    // Re-validate with server to ensure key hasn't been revoked
    const result = await verifyWithServer(saved.key, hwid)
    if (result.valid) {
      return { status: 'licensed', hwid, key: saved.key }
    }

    return { status: 'invalid', hwid, message: result.message }
  })

  // Activate a new license key
  ipcMain.handle('license:activate', async (_event, key: string) => {
    const hwid = getHardwareId()
    const result = await verifyWithServer(key.trim().toUpperCase(), hwid)

    if (result.valid) {
      saveLicense(key.trim().toUpperCase(), hwid)
      return { success: true, message: 'License activated. Welcome to J.A.R.V.I.S.!' }
    }

    return { success: false, message: result.message }
  })

  // Get current HWID (shown in the license screen for support)
  ipcMain.handle('license:get-hwid', () => getHardwareId())
}
