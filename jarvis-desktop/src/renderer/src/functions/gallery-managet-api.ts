export const readGalleryImages = async () => {
  try {
    const images: any[] = await window.electron.ipcRenderer.invoke('get-gallery')
    if (!images || images.length === 0) return 'Visual Vault is empty. No images found.'

    return images
      .slice(0, 25)
      .map((img) => `🖼️ Name: "${img.displayName}" | Path: ${img.path}`)
      .join('\n')
  } catch (e) {
    return 'System Error: Could not access Visual Vault.'
  }
}

export const analyzeDirectPhoto = async (filePath: string, socket: WebSocket | null) => {
  try {
    const url = `file:///${filePath.replace(/\\/g, '/')}`
    const res = await fetch(url)
    const blob = await res.blob()
    const reader = new FileReader()

    return new Promise((resolve) => {
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1]

        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              realtimeInput: {
                video: {
                  mimeType: 'image/png',
                  data: base64data
                }
              }
            })
          )
          resolve(
            '✅ Photo successfully injected into your vision. You can now see it. Describe what you see to Susant.'
          )
        } else {
          resolve('❌ Failed: Connection not open.')
        }
      }
      reader.readAsDataURL(blob)
    })
  } catch (e) {
    return '❌ Error loading direct photo.'
  }
}
