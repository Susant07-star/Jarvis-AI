export const ghostType = async (text: string) => {
  try {
    const actions = [{ type: 'type', text: text }]
    await window.electron.ipcRenderer.invoke('ghost-sequence', actions)
    return '✅ Typing complete.'
  } catch (error) {
    return '❌ Failed to type.'
  }
}

export const executeGhostSequence = async (jsonString: string) => {
  try {
    const actions = JSON.parse(jsonString)
    await window.electron.ipcRenderer.invoke('ghost-sequence', actions)
    return '✅ Sequence executed successfully.'
  } catch (error) {
    return '❌ Failed to execute sequence. Invalid JSON.'
  }
}
