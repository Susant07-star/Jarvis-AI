import './assets/main.css'

// ── Terminal Console Bridge ────────────────────────────────────────────
// Overrides window.console in the RENDERER world and forwards every call
// to the main process via IPC so all logs appear in your terminal.
;(function installConsoleBridge() {
  const ipc = (window as any)?.electron?.ipcRenderer
  if (!ipc) return // not in Electron — skip silently

  const SPAM = [
    'Heartbeat', 'System resources normal', 'brain:get-status',
    'get-system-info', 'get-screen-source', '[TICK]', 'SystemMonitor',
    'get-running-apps', 'get-live-location'
  ]
  const DEDUP_MS = 2000
  const cache = new Map<string, number>()

  function suppress(msg: string): boolean {
    if (SPAM.some(p => msg.includes(p))) return true
    const now = Date.now()
    const last = cache.get(msg)
    if (last && now - last < DEDUP_MS) return true
    cache.set(msg, now)
    if (cache.size > 300) {
      const oldest = [...cache.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100)
      oldest.forEach(([k]) => cache.delete(k))
    }
    return false
  }

  function bridge(level: 'log' | 'info' | 'warn' | 'error' | 'debug') {
    const orig = console[level].bind(console)
    console[level] = (...args: any[]) => {
      orig(...args)
      try {
        const msg = args.map(a => {
          if (a === null || a === undefined) return String(a)
          if (a instanceof Error) return `${a.message}\n${a.stack}`
          if (typeof a === 'object') { try { return JSON.stringify(a) } catch { return String(a) } }
          return String(a)
        }).join(' ')
        if (!suppress(msg)) ipc.send('renderer:console', { level, msg })
      } catch { /* never block UI for a logging failure */ }
    }
  }

  bridge('log'); bridge('info'); bridge('warn'); bridge('error'); bridge('debug')
})()

import React, { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'

import IndexRoot from './IndexRoot'
import LicenseGate from './auth/LicenseGate'
import SetupWizard from './auth/SetupWizard'

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.type === 'cancelation' || event.reason?.msg === 'operation is manually canceled') {
    event.preventDefault()
    return
  }

  console.warn('Suppressing unhandled promise rejection to prevent app crash:', event.reason)
  event.preventDefault()
})

class SystemErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#050505] flex flex-col items-center justify-center text-red-500 font-mono p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">CRITICAL SYSTEM FAILURE</h1>
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300 max-w-2xl wrap-break-word">
            {this.state.errorMsg}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<IndexRoot />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

const RootApp = () => {
  const [isLicensed, setIsLicensed] = useState(false)
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    if (isLicensed) {
      window.electron.ipcRenderer.invoke('vault:is-configured').then(res => {
        setIsConfigured(res)
      })
    }
  }, [isLicensed])

  if (!isLicensed) {
    return <LicenseGate onActivated={() => setIsLicensed(true)} />
  }

  if (isConfigured === null) {
    return <div className="h-screen w-screen bg-[#030303]" />
  }

  if (!isConfigured) {
    return <SetupWizard onComplete={() => setIsConfigured(true)} />
  }

  return (
    <HashRouter>
      <AppRouter />
    </HashRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SystemErrorBoundary>
      <RootApp />
    </SystemErrorBoundary>
  </StrictMode>
)
