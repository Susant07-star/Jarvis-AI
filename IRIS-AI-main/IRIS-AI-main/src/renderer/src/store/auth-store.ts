import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface AuthState {
  accessToken: string | null
  isAuthInitialized: boolean

  setAccessToken: (token: string | null) => void
  setIsAuthInitialized: (value: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    accessToken: null,
    isAuthInitialized: false,

    setAccessToken: (token) =>
      set((state) => {
        state.accessToken = token
      }),

    setIsAuthInitialized: (value) =>
      set((state) => {
        state.isAuthInitialized = value
      }),

    logout: () =>
      set((state) => {
        state.accessToken = null
        state.isAuthInitialized = true
      })
  }))
)
