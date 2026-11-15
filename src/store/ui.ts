import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  theme: 'light' | 'dark'
  collapsed: boolean
  mobileOpen: boolean
  toggleTheme: () => void
  toggleCollapsed: () => void
  setMobileOpen: (v: boolean) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      collapsed: false,
      mobileOpen: false,
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
    }),
    { name: 'mmcg-ui', partialize: (s) => ({ theme: s.theme, collapsed: s.collapsed }) },
  ),
)
