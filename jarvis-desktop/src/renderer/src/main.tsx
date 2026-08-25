import './assets/main.css'

import React, { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'

import IndexRoot from './IndexRoot'
import LicenseGate from './auth/LicenseGate'
import SetupWizard from './auth/SetupWizard'

window.addEventListener('unhandledrejection', (event) => {
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
