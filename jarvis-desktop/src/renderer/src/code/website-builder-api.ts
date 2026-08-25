export const buildAnimatedWebsite = async (prompt: string) => {
  try {
    const geminiKey = localStorage.getItem('iris_custom_api_key') || ''

    if (!geminiKey.trim()) {
      return `❌ System Error: Missing Gemini API Key. Please update it in the Command Center Vault.`
    }

    const res = await window.electron.ipcRenderer.invoke('build-animated-website', {
      prompt,
      geminiKey
    })

    if (res.success) {
      return `✅ Website generated successfully and saved to ${res.filePath}.`
    } else {
      return `❌ System Error during synthesis: ${res.error}`
    }
  } catch (error) {
    return `System Error: Unable to establish connection to the Live Forge.`
  }
}
