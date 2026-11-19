import type { Profile, Role } from '@/types'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  store_admin: 'Admin Boutique',
  store_manager: 'Responsable Boutique',
  pole_chief: 'Chef de Pôle',
  cashier: 'Caissier',
  stock_manager: 'Gestionnaire Stock',
}

export const ROLES: Role[] = [
  'super_admin',
  'store_admin',
  'store_manager',
  'pole_chief',
  'cashier',
  'stock_manager',
]

export type Permission =
  | 'dashboard'
  | 'pos'
  | 'sales.view'
  | 'products.view'
  | 'products.edit'
  | 'catalog.settings'
  | 'inventory.view'
  | 'inventory.move'
  | 'inventory.adjust'
  | 'transfers.view'
  | 'transfers.create'
  | 'transfers.receive'
  | 'reports.daily.view'
  | 'reports.daily.edit'
  | 'reports.daily.validate'
  | 'analytics'
  | 'stores.view'
  | 'stores.edit'
  | 'users.view'
  | 'users.manage'
  | 'audit'
  | 'discount.approve'

const ALL: Role[] = ROLES

const MATRIX: Record<Permission, Role[]> = {
  dashboard: ALL,
  pos: ['super_admin', 'store_admin', 'store_manager', 'cashier'],
  'sales.view': ['super_admin', 'store_admin', 'store_manager', 'pole_chief', 'cashier'],
  'products.view': ALL,
  'products.edit': ['super_admin', 'store_admin', 'stock_manager'],
  'catalog.settings': ['super_admin', 'store_admin', 'stock_manager'],
  'inventory.view': ['super_admin', 'store_admin', 'store_manager', 'pole_chief', 'stock_manager'],
  'inventory.move': ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
  'inventory.adjust': ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
  'transfers.view': ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
  'transfers.create': ['super_admin', 'store_admin', 'stock_manager'],
  'transfers.receive': ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
  'reports.daily.view': ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
  'reports.daily.edit': ['pole_chief', 'super_admin'],
  'reports.daily.validate': ['super_admin', 'store_admin'],
  analytics: ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
  'stores.view': ['super_admin', 'store_admin', 'pole_chief'],
  // Seul le Super Admin ajoute, modifie ou supprime boutiques et utilisateurs, et attribue les rôles.
  'stores.edit': ['super_admin'],
  'users.view': ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
  'users.manage': ['super_admin'],
  audit: ['super_admin'],
  'discount.approve': ['super_admin', 'store_admin', 'store_manager'],
}

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false
  return MATRIX[permission].includes(role)
}

/** Rôles qu'un utilisateur peut attribuer : réservé au Super Admin. */
export function assignableRoles(role: Role): Role[] {
  return role === 'super_admin' ? ROLES : []
}

/** Seuil de remise au-delà duquel une validation superviseur est requise. */
export const DISCOUNT_SUPERVISOR_THRESHOLD = 15
/** Tolérance d'écart de caisse (en %). */
export const CASH_VARIANCE_TOLERANCE = 2

/**
 * Périmètre de boutiques d'un utilisateur. `null` = toutes les boutiques.
 * Réplique côté client de la fonction SQL `user_store_ids()`.
 */
export function storeScope(user: Profile | null): string[] | null {
  if (!user) return []
  if (user.role === 'super_admin' || user.role === 'stock_manager') return null
  const ids = new Set<string>(user.store_ids)
  if (user.store_id) ids.add(user.store_id)
  return [...ids]
}

export function inScope(user: Profile | null, storeId: string | null | undefined) {
  const scope = storeScope(user)
  if (scope === null) return true
  return !!storeId && scope.includes(storeId)
}
