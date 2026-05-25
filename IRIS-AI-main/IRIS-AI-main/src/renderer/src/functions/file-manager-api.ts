export const readFile = async (filePath: string) => {
  try {
    return await window.electron.ipcRenderer.invoke('read-file', filePath)
  } catch (err) {
    return `Error: ${err}`
  }
}

export const writeFile = async (fileName: string, content: string) => {
  try {
    return await window.electron.ipcRenderer.invoke('write-file', { fileName, content })
  } catch (err) {
    return `Error: ${err}`
  }
}

export const manageFile = async (
  operation: 'copy' | 'move' | 'delete',
  sourcePath: string,
  destPath?: string
) => {
  try {
    return await window.electron.ipcRenderer.invoke('file-ops', { operation, sourcePath, destPath })
  } catch (err) {
    return `Error: ${err}`
  }
}

export const openFile = async (filePath: string) => {
  try {
    const result = await window.electron.ipcRenderer.invoke('file:open', filePath)
    if (result.success) return 'File opened successfully.'
    return `Error opening file: ${result.error}`
  } catch (err) {
    return `System Error: ${err}`
  }
}

export const readDirectory = async (dirPath: string) => {
  try {
    const result = await window.electron.ipcRenderer.invoke('read-directory', dirPath)
    return result
  } catch (err) {
    return `System Error: ${err}`
  }
}

export const createFolder = async (path: string) => {
  try {
    return (await window.electron.ipcRenderer.invoke('create-directory', path)).success
      ? `✅ Created: ${path}`
      : '❌ Failed.'
  } catch (e) {
    return 'Error'
  }
}
