import './assets/main.css'

import React, { JSX, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'

import LockScreen from './UI/LockScreen'
import LoginPage from './auth/Login'
import { useAuthStore } from './store/auth-store'
import AxiosInstance from './config/AxiosInstance'
import AuthInitializer from './auth/AuthToken'
import IndexRoot from './IndexRoot'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const electronAPI = (window as any).electron?.ipcRenderer

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

let isSessionUnlocked = false

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const [status, setStatus] = useState<'checking' | 'authorized'>('checking')
  const navigate = useNavigate()
  const location = useLocation()

  const accessToken = useAuthStore((state) => state.accessToken)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          navigate('/login', { replace: true })
          return
        }
          
        const email = session.user?.email;
        if (import.meta.env.VITE_OWNER_EMAIL && email !== import.meta.env.VITE_OWNER_EMAIL) {
          await supabase.auth.signOut();
          navigate('/login', { replace: true })
          return;
        }

        if (!isSessionUnlocked && location.pathname !== '/lock') {
          navigate('/lock', { replace: true })
          return
        }

        setStatus('authorized')
      } catch (error) {
        logout()
        navigate('/login', { replace: true })
      }
    }

    verifyAccess()
  }, [navigate, location.pathname, logout])

  if (status === 'checking') {
    return (
      <div className="h-screen w-screen bg-[#050505] flex items-center justify-center text-[#10b981] font-mono text-sm tracking-widest uppercase">
        Verifying Security Clearance...
      </div>
    )
  }

  return children
}

const PublicRoute = ({ children }: { children: JSX.Element }) => {
  const accessToken =
    useAuthStore((state) => state.accessToken) || localStorage.getItem('iris_cloud_token')
  return accessToken ? <Navigate to="/" replace /> : children
}

const AppRouter = () => {
  const navigate = useNavigate()

  useEffect(() => {
    if (electronAPI) {
      electronAPI.on('oauth-callback', async (_event: any, url: string) => {
        try {
          const urlObj = new URL(url.replace('iris://', 'http://localhost/'))
          const hashParams = new URLSearchParams(urlObj.hash.substring(1))

          const refreshToken = hashParams.get('refresh_token') || urlObj.searchParams.get('refreshToken')
          const accessToken = hashParams.get('access_token') || urlObj.searchParams.get('accessToken')

          if (refreshToken && accessToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            useAuthStore.getState().setAccessToken(accessToken)
            navigate('/')
          }
        } catch (e) {
          console.error(e)
        }
      })
    }
    return () => electronAPI?.removeAllListeners('oauth-callback')
  }, [navigate])

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />


      <Route
        path="/lock"
        element={
          <ProtectedRoute>
            <LockScreen
              onUnlock={() => {
                isSessionUnlocked = true
                navigate('/')
              }}
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <IndexRoot />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SystemErrorBoundary>
      <HashRouter>
        <AuthInitializer />
        <AppRouter />
      </HashRouter>
    </SystemErrorBoundary>
  </StrictMode>
)
