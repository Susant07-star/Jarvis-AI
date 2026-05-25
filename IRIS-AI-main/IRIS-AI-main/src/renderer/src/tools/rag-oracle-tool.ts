export const ingestCodebase = async (dirPath: string): Promise<string> => {
  try {
    const geminiKey = localStorage.getItem('iris_custom_api_key') || ''

    if (!geminiKey.trim()) {
      throw new Error('Missing Gemini API Key. Please update it in the Command Center Vault.')
    }

    window.dispatchEvent(new CustomEvent('oracle-ingest-start', { detail: { path: dirPath } }))

    const cleanupListener = window.electron.ipcRenderer.on(
      'oracle-progress',
      (_ipcEvent: any, data: any) => {
        const payload = data || _ipcEvent
        window.dispatchEvent(new CustomEvent('oracle-progress', { detail: payload }))
      }
    )

    const result = await window.electron.ipcRenderer.invoke('ingest-codebase', {
      dirPath,
      geminiKey
    })

    if (typeof cleanupListener === 'function') cleanupListener()

    if (result.success) {
      window.dispatchEvent(
        new CustomEvent('oracle-ingest-done', { detail: { chunks: result.totalChunks } })
      )
      const msg = result.wasResumed
        ? `✅ Successfully resumed and completed ingestion. Memory Banks fully loaded.`
        : `✅ Successfully ingested directory. Generated ${result.totalChunks} vectors.`
      return msg
    }
    return `❌ Ingestion Aborted or Failed: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}

export const consultOracle = async (query: string): Promise<string> => {
  try {
    const geminiKey = localStorage.getItem('iris_custom_api_key') || ''
    const groqKey = localStorage.getItem('iris_groq_api_key') || ''

    if (!geminiKey.trim() || !groqKey.trim()) {
      throw new Error(
        'Missing Gemini or Groq API Keys. Please configure them in the Command Center.'
      )
    }

    window.dispatchEvent(new CustomEvent('oracle-thinking'))

    const result = await window.electron.ipcRenderer.invoke('consult-oracle', {
      query,
      geminiKey,
      groqKey
    })

    if (result.success) {
      window.dispatchEvent(
        new CustomEvent('oracle-answered', { detail: { answer: result.answer } })
      )
      return `Code Analysis:\n${result.answer}`
    }
    return `❌ AI failed: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}

export const cancelIngestion = async (): Promise<void> => {
  await window.electron.ipcRenderer.invoke('cancel-ingestion')
}
