export const readEmails = async (maxResults: number = 5) => {
  try {
    const result: any = await window.electron.ipcRenderer.invoke('gmail-read', maxResults)

    const event = new CustomEvent('show-emails', {
      detail: { emails: result.uiData }
    })
    window.dispatchEvent(event)

    return result.speechText
  } catch (err) {
    return `System Error: Could not read emails.`
  }
}

export const sendEmail = async (to: string, subject: string, body: string) => {
  try {
    return await window.electron.ipcRenderer.invoke('gmail-send', { to, subject, body })
  } catch (err) {
    return `System Error: Could not send email.`
  }
}

export const draftEmail = async (to: string, subject: string, body: string) => {
  try {
    return await window.electron.ipcRenderer.invoke('gmail-draft', { to, subject, body })
  } catch (err) {
    return `System Error: Could not draft email.`
  }
}
