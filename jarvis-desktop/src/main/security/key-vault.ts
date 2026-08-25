import { ipcMain, safeStorage, app } from 'electron'
import Store from 'electron-store'

const StoreClass = (Store as any).default || Store
const store = new StoreClass({ name: 'jarvis_secure_vault' })

export interface JarvisConfig {
  JARVIS_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

/**
 * Encrypts a string using Electron's native OS integration.
 * - Windows: DPAPI (Data Protection API)
 * - macOS: Keychain Access
 * - Linux: Secret Service API / GNOME Keyring / KWallet
 */
function encrypt(text: string): string {
  if (!text) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[J.A.R.V.I.S. Vault] safeStorage is not available! Keys will be saved in plaintext.')
    return text
  }
  return safeStorage.encryptString(text).toString('base64')
}

/**
 * Decrypts a previously encrypted base64 string.
 */
function decrypt(base64Text: string): string {
  if (!base64Text) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    return base64Text
  }
  try {
    const buffer = Buffer.from(base64Text, 'base64')
    return safeStorage.decryptString(buffer)
  } catch (err) {
    console.error('[J.A.R.V.I.S. Vault] Decryption failed:', err)
    return ''
  }
}

export function registerKeyVaultHandlers() {
  // Save configuration (encrypts sensitive keys)
  ipcMain.handle('vault:save-config', (_event, config: JarvisConfig) => {
    try {
      store.set('JARVIS_API_KEY', encrypt(config.JARVIS_API_KEY))
      store.set('SUPABASE_URL', encrypt(config.SUPABASE_URL)) // URL isn't strictly a secret, but we encrypt for consistency
      store.set('SUPABASE_ANON_KEY', encrypt(config.SUPABASE_ANON_KEY))
      return { success: true }
    } catch (err: any) {
      console.error('[J.A.R.V.I.S. Vault] Failed to save config:', err)
      return { success: false, error: err.message }
    }
  })

  // Load configuration (decrypts and returns to renderer)
  // WARNING: Only the renderer should call this when initializing internal memory!
  ipcMain.handle('vault:load-config', () => {
    return {
      JARVIS_API_KEY: decrypt(store.get('JARVIS_API_KEY') as string || ''),
      SUPABASE_URL: decrypt(store.get('SUPABASE_URL') as string || ''),
      SUPABASE_ANON_KEY: decrypt(store.get('SUPABASE_ANON_KEY') as string || '')
    }
  })

  // Check if J.A.R.V.I.S. has been configured (used by main.tsx routing)
  ipcMain.handle('vault:is-configured', () => {
    const key = store.get('JARVIS_API_KEY') as string
    return !!key && key.length > 0
  })

  // Helper for Main Process backend services to get decrypted keys locally
  // (e.g. for the API bridge, Wormhole, etc.)
}

export function getDecryptedConfig(): JarvisConfig {
  return {
    JARVIS_API_KEY: decrypt(store.get('JARVIS_API_KEY') as string || ''),
    SUPABASE_URL: decrypt(store.get('SUPABASE_URL') as string || ''),
    SUPABASE_ANON_KEY: decrypt(store.get('SUPABASE_ANON_KEY') as string || '')
  }
}
