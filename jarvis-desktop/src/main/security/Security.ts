import { ipcMain } from 'electron'
import Store from 'electron-store'
import bcrypt from 'bcryptjs'

const StoreClass = (Store as any).default || Store
const store = new StoreClass()

const JARVIS_KEYS = {
  face: 'jarvis_vault_face',
  faces: 'jarvis_vault_faces',
  hash: 'jarvis_vault_hash',
  personality: 'jarvis_personality'
}

const LEGACY_KEYS = {
  face: 'iris_vault_face',
  faces: 'iris_vault_faces',
  hash: 'iris_vault_hash',
  personality: 'iris_personality'
}

export default function registerSecurityVault() {
  const singleFace = (store.get(JARVIS_KEYS.face) || store.get(LEGACY_KEYS.face)) as number[] | undefined
  const savedFaces = (store.get(JARVIS_KEYS.faces) || store.get(LEGACY_KEYS.faces)) as number[][] | undefined

  if (savedFaces && !store.get(JARVIS_KEYS.faces)) {
    store.set(JARVIS_KEYS.faces, savedFaces)
  }

  if (singleFace && !store.get(JARVIS_KEYS.faces)) {
    store.set(JARVIS_KEYS.faces, [singleFace])
    store.delete(JARVIS_KEYS.face)
    store.delete(LEGACY_KEYS.face)
  }

  if (store.get(LEGACY_KEYS.hash) && !store.get(JARVIS_KEYS.hash)) {
    store.set(JARVIS_KEYS.hash, store.get(LEGACY_KEYS.hash))
  }

  if (store.get(LEGACY_KEYS.personality) && !store.get(JARVIS_KEYS.personality)) {
    store.set(JARVIS_KEYS.personality, store.get(LEGACY_KEYS.personality))
  }

  ipcMain.handle('check-vault-status', () => {
    const hasPin = !!store.get(JARVIS_KEYS.hash)
    const faces = store.get(JARVIS_KEYS.faces) as number[][] | undefined
    const hasFace = faces && faces.length > 0
    return { hasPin, hasFace, faceCount: faces ? faces.length : 0 }
  })

  ipcMain.handle('get-personality', () => {
    return store.get(JARVIS_KEYS.personality) as string | undefined
  })

  ipcMain.handle('set-personality', (_, text: string) => {
    store.set(JARVIS_KEYS.personality, text)
    return true
  })

  ipcMain.handle('setup-vault-pin', async (_, pin: string) => {
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(pin, salt)
    store.set(JARVIS_KEYS.hash, hash)
    return true
  })

  ipcMain.handle('verify-vault-pin', async (_, pin: string) => {
    const hash = store.get(JARVIS_KEYS.hash) as string
    if (!hash) return false
    return await bcrypt.compare(pin, hash)
  })

  ipcMain.handle('setup-vault-face', (_, descriptor: number[]) => {
    const faces = (store.get(JARVIS_KEYS.faces) as number[][]) || []
    faces.push(descriptor)
    store.set(JARVIS_KEYS.faces, faces)
    return true
  })

  ipcMain.handle('verify-vault-face', (_, descriptor: number[]) => {
    const faces = store.get(JARVIS_KEYS.faces) as number[][] | undefined
    if (!faces || faces.length === 0) return false

    for (const savedFace of faces) {
      if (savedFace.length !== 128) continue
      let distance = 0
      for (let i = 0; i < descriptor.length; i++) {
        distance += Math.pow(descriptor[i] - savedFace[i], 2)
      }
      distance = Math.sqrt(distance)

      if (distance < 0.55) return true
    }
    return false
  })
}
