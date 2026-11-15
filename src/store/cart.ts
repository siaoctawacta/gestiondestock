import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartState {
  lines: { product_id: string; quantity: number }[]
  discountMode: 'percent' | 'amount'
  discountValue: number
  add: (productId: string, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  setDiscount: (mode: 'percent' | 'amount', value: number) => void
  clear: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      discountMode: 'percent',
      discountValue: 0,
      add: (product_id, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.product_id === product_id)
          if (existing)
            return {
              lines: s.lines.map((l) => (l.product_id === product_id ? { ...l, quantity: l.quantity + qty } : l)),
            }
          return { lines: [...s.lines, { product_id, quantity: qty }] }
        }),
      setQty: (product_id, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.product_id !== product_id)
              : s.lines.map((l) => (l.product_id === product_id ? { ...l, quantity: qty } : l)),
        })),
      remove: (product_id) => set((s) => ({ lines: s.lines.filter((l) => l.product_id !== product_id) })),
      setDiscount: (discountMode, discountValue) => set({ discountMode, discountValue }),
      clear: () => set({ lines: [], discountValue: 0 }),
    }),
    { name: 'mmcg-pos-cart' },
  ),
)
