export const getRunningApps = async (): Promise<string[]> => {
  try {
    return await window.electron.ipcRenderer.invoke('get-running-apps')
  } catch (err) {
    return []
  }
}
