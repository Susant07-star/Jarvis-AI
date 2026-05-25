import { IpcMain } from 'electron'
import { startTunnel } from 'untun'

let activeTunnel: any = null

export default function registerWormhole({ ipcMain }: { ipcMain: IpcMain }) {
  ipcMain.handle('open-wormhole', async (_event, port: number) => {
    try {
      if (activeTunnel) {
        await activeTunnel.close()
        activeTunnel = null
      }

      activeTunnel = await startTunnel({
        port,
        acceptCloudflareNotice: true
      })

      const tunnelUrl = await activeTunnel.getURL()

      return {
        success: true,
        url: tunnelUrl,
        password: null
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('close-wormhole', async () => {
    if (activeTunnel) {
      await activeTunnel.close()
      activeTunnel = null
    }
    return { success: true }
  })
}

export async function autoStartWormhole(port: number): Promise<string | null> {
  try {
    if (activeTunnel) {
      await activeTunnel.close()
      activeTunnel = null
    }
    activeTunnel = await startTunnel({
      port,
      acceptCloudflareNotice: true
    })
    const tunnelUrl = await activeTunnel.getURL()
    console.log(`\n======================================================`)
    console.log(`[WORMHOLE ACTIVE] I.R.I.S. is exposed to the internet.`)
    console.log(`Copy this URL to your J.A.R.V.I.S. IRIS_WORMHOLE_URL:`)
    console.log(`=> ${tunnelUrl}`)
    console.log(`======================================================\n`)
    return tunnelUrl
  } catch (err) {
    console.error(`[WORMHOLE ERROR] Failed to start tunnel:`, err)
    return null
  }
}
