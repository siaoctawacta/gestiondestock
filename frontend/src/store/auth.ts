import { create } from 'zustand'
import type { Profile } from '@/types'
import { api } from '@/data'

interface AuthState {
  user: Profile | null
  ready: boolean
  /** Boutique active (POS, déclarations, filtres par défaut). */
  activeStoreId: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<Profile>
  signOut: () => Promise<void>
  setUser: (u: Profile) => void
  setActiveStore: (id: string | null) => void
}

const STORE_KEY = 'mmcg-active-store'
const readStore = () => {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

function defaultStore(u: Profile | null) {
  if (!u) return null
  const saved = readStore()
  if (saved && (u.role === 'super_admin' || u.role === 'stock_manager' || u.store_id === saved || u.store_ids.includes(saved)))
    return saved
  return u.store_id ?? u.store_ids[0] ?? null
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  activeStoreId: null,
  async init() {
    try {
      const user = await api.currentUser()
      set({ user, ready: true, activeStoreId: defaultStore(user) })
    } catch {
      set({ user: null, ready: true })
    }
  },
  async signIn(email, password) {
    const user = await api.signIn(email, password)
    set({ user, activeStoreId: defaultStore(user) })
    return user
  },
  async signOut() {
    await api.signOut()
    set({ user: null, activeStoreId: null })
  },
  setUser(user) {
    set({ user })
  },
  setActiveStore(id) {
    try {
      if (id) localStorage.setItem(STORE_KEY, id)
      else localStorage.removeItem(STORE_KEY)
    } catch {
      /* ignore */
    }
    set({ activeStoreId: id })
  },
}))
