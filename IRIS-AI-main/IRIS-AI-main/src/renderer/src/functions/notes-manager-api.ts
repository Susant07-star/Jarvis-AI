export const saveNote = async (title: string, content: string) => {
  try {
    const result = await window.electron.ipcRenderer.invoke('save-note', { title, content })
    if (result.success) return `Note saved successfully as ${title}.`
    return `Failed to save note: ${result.error}`
  } catch (e) {
    return 'System Error saving note.'
  }
}

export const readSystemNotes = async () => {
  try {
    const notes: any[] = await window.electron.ipcRenderer.invoke('get-notes')
    if (!notes || notes.length === 0) return 'Memory Bank is empty. No notes found.'

    return notes
      .slice(0, 10)
      .map((n) => `📄 [NOTE: ${n.title}]\n${n.content}`)
      .join('\n\n')
  } catch (e) {
    return 'System Error: Could not access Memory Bank.'
  }
}
