import type { DataApi } from './api'
import type {
  AppNotification,
  AuditLog,
  Category,
  DailyReport,
  InventoryItem,
  Product,
  Profile,
  Sale,
  StockMovement,
  Store,
  Supplier,
  Transfer,
} from '@/types'

/**
 * Implémentation du contrat DataApi sur l'API REST Laravel (dossier backend/).
 * Authentification par jeton Laravel Sanctum (en-tête Authorization: Bearer).
 * L'hébergement mutualisé n'offre pas de WebSocket : le « temps réel » est
 * assuré par un rafraîchissement périodique (voir subscribe()).
 */

const BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const TOKEN_KEY = 'mm-api-token'

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* stockage indisponible */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion internet.', 0)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') setToken(null)
    // Erreurs de validation Laravel : { message, errors: { champ: [msg] } }
    const first = data?.errors ? (Object.values(data.errors)[0] as string[] | undefined)?.[0] : null
    throw new ApiError(first || data?.message || `Erreur ${res.status}`, res.status)
  }
  return data as T
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return s ? `?${s}` : ''
}

export const laravelApi: DataApi = {
  mode: 'laravel',

  /* ---------------- Auth ---------------- */
  async signIn(email, password) {
    const res = await request<{ token: string; user: Profile }>('POST', '/auth/login', { email, password })
    setToken(res.token)
    return res.user
  },
  async signOut() {
    try {
      if (getToken()) await request('POST', '/auth/logout')
    } finally {
      setToken(null)
    }
  },
  async currentUser() {
    if (!getToken()) return null
    try {
      return await request<Profile>('GET', '/auth/me')
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setToken(null)
        return null
      }
      throw e
    }
  },
  async requestPasswordReset(email) {
    await request('POST', '/auth/forgot-password', { email })
  },
  async updatePassword(password) {
    await request('PUT', '/auth/password', { password })
  },
  async resetPasswordWithToken(token, email, password) {
    await request('POST', '/auth/reset-password', { token, email, password })
  },
  async verifySupervisor(email, password) {
    return request<Profile>('POST', '/auth/verify-supervisor', { email, password })
  },
  async updateOwnProfile(input) {
    return request<Profile>('PUT', '/auth/profile', input)
  },

  /* ---------------- Référentiels ---------------- */
  listStores: () => request<Store[]>('GET', '/stores'),
  saveStore: (input) =>
    input.id ? request<Store>('PUT', `/stores/${input.id}`, input) : request<Store>('POST', '/stores', input),
  deleteStore: (id) => request('DELETE', `/stores/${id}`),
  listUsers: () => request<Profile[]>('GET', '/users'),
  saveUser: (input) =>
    input.id ? request<Profile>('PUT', `/users/${input.id}`, input) : request<Profile>('POST', '/users', input),
  setUserActive: (id, active) => request('PATCH', `/users/${id}/active`, { is_active: active }),
  deleteUser: (id) => request('DELETE', `/users/${id}`),
  listCategories: () => request<Category[]>('GET', '/categories'),
  saveCategory: (input) =>
    input.id
      ? request<Category>('PUT', `/categories/${input.id}`, input)
      : request<Category>('POST', '/categories', input),
  deleteCategory: (id) => request('DELETE', `/categories/${id}`),
  listSuppliers: () => request<Supplier[]>('GET', '/suppliers'),
  saveSupplier: (input) =>
    input.id
      ? request<Supplier>('PUT', `/suppliers/${input.id}`, input)
      : request<Supplier>('POST', '/suppliers', input),
  deleteSupplier: (id) => request('DELETE', `/suppliers/${id}`),

  /* ---------------- Catalogue ---------------- */
  listProducts: () => request<Product[]>('GET', '/products'),
  saveProduct: (input) =>
    input.id ? request<Product>('PUT', `/products/${input.id}`, input) : request<Product>('POST', '/products', input),
  async uploadProductImage(file) {
    const form = new FormData()
    form.append('image', file)
    const res = await request<{ url: string }>('POST', '/products/image', form)
    return res.url
  },

  /* ---------------- Stock ---------------- */
  listInventory: () => request<InventoryItem[]>('GET', '/inventory'),
  setStoreMinLevel: (store_id, product_id, min) =>
    request('PATCH', '/inventory/min-level', { store_id, product_id, min_stock_level: min }),
  listMovements: (limit = 500) => request<StockMovement[]>('GET', `/movements${qs({ limit })}`),
  stockEntry: (input) => request('POST', '/stock/entries', input),
  adjustStock: (input) => request('POST', '/stock/adjustments', input),
  listTransfers: () => request<Transfer[]>('GET', '/transfers'),
  createTransfer: (input) => request<Transfer>('POST', '/transfers', input),
  receiveTransfer: (id) => request('POST', `/transfers/${id}/receive`),
  cancelTransfer: (id) => request('POST', `/transfers/${id}/cancel`),

  /* ---------------- Ventes ---------------- */
  listSales: (filter = {}) => request<Sale[]>('GET', `/sales${qs({ ...filter })}`),
  createSale: (input) => request<Sale>('POST', '/sales', input),

  /* ---------------- Déclarations ---------------- */
  listDailyReports: () => request<DailyReport[]>('GET', '/daily-reports'),
  async theoreticalAmount(storeId, date) {
    const res = await request<{ amount: number }>('GET', `/daily-reports/theoretical${qs({ store_id: storeId, date })}`)
    return Number(res.amount)
  },
  saveDailyReport: (input) => request<DailyReport>('POST', '/daily-reports', input),
  submitDailyReport: (id) => request('POST', `/daily-reports/${id}/submit`),
  validateDailyReport: (id) => request('POST', `/daily-reports/${id}/validate`),
  rejectDailyReport: (id, reason) => request('POST', `/daily-reports/${id}/reject`, { reason }),

  /* ---------------- Notifications & audit ---------------- */
  listNotifications: () => request<AppNotification[]>('GET', '/notifications'),
  markNotificationRead: (id) => request('POST', `/notifications/${id}/read`),
  markAllNotificationsRead: () => request('POST', '/notifications/read-all'),
  listAuditLogs: () => request<AuditLog[]>('GET', '/audit-logs'),

  /**
   * Pas de WebSocket sur l'hébergement mutualisé : on signale toutes les 20 s
   * que les données vivantes ont pu changer, et React Query les recharge.
   */
  subscribe(onChange) {
    const tables = ['inventory', 'notifications', 'sales', 'transfers', 'daily_reports']
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && getToken()) tables.forEach(onChange)
    }, 20_000)
    return () => window.clearInterval(timer)
  },
}
