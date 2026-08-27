import { useEffect } from 'react'
import { useAuthStore } from '../store/auth-store'
import AxiosInstance from '../config/AxiosInstance'

const CLOUD_TOKEN_KEY = 'jarvis_cloud_token'
const LEGACY_CLOUD_TOKEN_KEY = 'iris_cloud_token'

export default function AuthInitializer() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken)
  const setIsAuthInitialized = useAuthStore((s: any) => s.setIsAuthInitialized)

  useEffect(() => {
    const init = async () => {
      try {
        if (!import.meta.env.VITE_JARVIS_API_KEY) {
          setAccessToken(null)
          return
        }

        const storedRefreshToken =
          localStorage.getItem(CLOUD_TOKEN_KEY) || localStorage.getItem(LEGACY_CLOUD_TOKEN_KEY)

        if (!storedRefreshToken) {
          setAccessToken(null)
          return
        }

        const res = await AxiosInstance.post('/users/refresh-token', {
          refreshToken: storedRefreshToken
        })

        const accessToken = res.data.accessToken
        setAccessToken(accessToken)

        if (res.data.refreshToken) {
          localStorage.setItem(CLOUD_TOKEN_KEY, res.data.refreshToken)
          localStorage.setItem(LEGACY_CLOUD_TOKEN_KEY, res.data.refreshToken)
        }
      } catch (err) {
        setAccessToken(null)
        localStorage.removeItem(CLOUD_TOKEN_KEY)
        localStorage.removeItem(LEGACY_CLOUD_TOKEN_KEY)
      } finally {
        if (setIsAuthInitialized) setIsAuthInitialized(true)
      }
    }

    init()
  }, [setAccessToken, setIsAuthInitialized])

  return null
}
