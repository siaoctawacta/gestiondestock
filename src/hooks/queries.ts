import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/data'
import { useAuth } from '@/store/auth'
import { errorMessage } from '@/lib/utils'
import { can } from '@/lib/permissions'
import type { SalesFilter } from '@/types'

export const qk = {
  stores: ['stores'] as const,
  users: ['users'] as const,
  categories: ['categories'] as const,
  suppliers: ['suppliers'] as const,
  products: ['products'] as const,
  inventory: ['inventory'] as const,
  movements: ['movements'] as const,
  transfers: ['transfers'] as const,
  sales: (f: SalesFilter = {}) => ['sales', f] as const,
  dailyReports: ['daily_reports'] as const,
  notifications: ['notifications'] as const,
  audit: ['audit_logs'] as const,
}

/** Correspondance table modifiée → requêtes à invalider (temps réel). */
export const TABLE_KEYS: Record<string, QueryKey[]> = {
  stores: [qk.stores, qk.inventory],
  users: [qk.users],
  categories: [qk.categories],
  suppliers: [qk.suppliers],
  products: [qk.products, qk.inventory],
  inventory: [qk.inventory],
  movements: [qk.movements],
  stock_movements: [qk.movements],
  transfers: [qk.transfers],
  stock_transfers: [qk.transfers],
  sales: [['sales']],
  daily_reports: [qk.dailyReports],
  notifications: [qk.notifications],
  audit_logs: [qk.audit],
}

const useUserId = () => useAuth((s) => s.user?.id)

export const useStores = () => useQuery({ queryKey: qk.stores, queryFn: api.listStores })
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: api.listCategories })
export const useSuppliers = () => useQuery({ queryKey: qk.suppliers, queryFn: api.listSuppliers })
export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: api.listProducts })

export function useUsers() {
  const user = useAuth((s) => s.user)
  return useQuery({
    queryKey: [...qk.users, user?.id],
    queryFn: api.listUsers,
    enabled: can(user?.role, 'users.manage'),
  })
}

export function useInventory() {
  const id = useUserId()
  return useQuery({ queryKey: [...qk.inventory, id], queryFn: api.listInventory })
}
export function useMovements() {
  const id = useUserId()
  return useQuery({ queryKey: [...qk.movements, id], queryFn: () => api.listMovements(1000) })
}
export function useTransfers() {
  const id = useUserId()
  return useQuery({ queryKey: [...qk.transfers, id], queryFn: api.listTransfers })
}
export function useSales(filter: SalesFilter = {}, enabled = true) {
  const id = useUserId()
  return useQuery({ queryKey: [...qk.sales(filter), id], queryFn: () => api.listSales(filter), enabled })
}
export function useDailyReports() {
  const user = useAuth((s) => s.user)
  return useQuery({
    queryKey: [...qk.dailyReports, user?.id],
    queryFn: api.listDailyReports,
    enabled: can(user?.role, 'reports.daily.view'),
  })
}
export function useNotifications() {
  const id = useUserId()
  return useQuery({ queryKey: [...qk.notifications, id], queryFn: api.listNotifications, refetchInterval: 60_000 })
}
export function useAuditLogs() {
  return useQuery({ queryKey: qk.audit, queryFn: api.listAuditLogs })
}

/** Index pratiques (id → entité). */
export function useLookups() {
  const stores = useStores().data ?? []
  const products = useProducts().data ?? []
  const categories = useCategories().data ?? []
  const suppliers = useSuppliers().data ?? []
  const users = useUsers().data ?? []
  return useMemo(
    () => ({
      store: new Map(stores.map((s) => [s.id, s])),
      product: new Map(products.map((p) => [p.id, p])),
      category: new Map(categories.map((c) => [c.id, c])),
      supplier: new Map(suppliers.map((s) => [s.id, s])),
      user: new Map(users.map((u) => [u.id, u])),
    }),
    [stores, products, categories, suppliers, users],
  )
}

/** Mutation avec toast de succès / erreur et invalidation des tables touchées. */
export function useAction<TArgs, TRes = unknown>(
  fn: (args: TArgs) => Promise<TRes>,
  opts: { success?: string | ((r: TRes) => string); tables?: string[]; onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      ;(opts.tables ?? []).forEach((t) => (TABLE_KEYS[t] ?? [[t]]).forEach((k) => qc.invalidateQueries({ queryKey: k })))
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(res) : opts.success)
      opts.onSuccess?.(res)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}
