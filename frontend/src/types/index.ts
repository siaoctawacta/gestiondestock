export type Role =
  | 'super_admin'
  | 'store_admin'
  | 'store_manager'
  | 'pole_chief'
  | 'cashier'
  | 'stock_manager'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: Role
  /** Boutique principale (caissier, responsable). */
  store_id: string | null
  /** Boutiques supplémentaires (admin boutique, chef de pôle). */
  store_ids: string[]
  is_active: boolean
  last_login_at: string | null
  created_at: string
  /** Suppression logique : l'historique reste rattaché. */
  deleted_at?: string | null
}

export interface Store {
  id: string
  code: string
  name: string
  address: string
  phone: string
  email: string
  region: string
  manager_id: string | null
  is_active: boolean
  created_at: string
  /** Suppression logique : ventes et mouvements conservés. */
  deleted_at?: string | null
}

export interface Category {
  id: string
  name: string
  code: string
  parent_id: string | null
}

export interface Supplier {
  id: string
  name: string
  contact_name: string
  phone: string
  email: string
  address: string
}

export interface Product {
  id: string
  sku: string
  barcode: string | null
  name: string
  brand: string
  description: string
  packaging: string
  category_id: string | null
  supplier_id: string | null
  purchase_price: number
  selling_price: number
  vat_rate: number
  min_stock_level: number
  image_url: string | null
  is_active: boolean
  created_at: string
}

export interface InventoryItem {
  id: string
  store_id: string
  product_id: string
  quantity: number
  min_stock_level: number | null
  updated_at: string
}

export type MovementType =
  | 'entry'
  | 'sale'
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'

export type AdjustmentReason = 'breakage' | 'theft' | 'expired' | 'tester' | 'inventory' | 'other'

export interface StockMovement {
  id: string
  product_id: string
  store_id: string
  user_id: string
  type: MovementType
  quantity: number
  reason: string | null
  lot_number: string | null
  expiry_date: string | null
  reference: string | null
  created_at: string
}

export type TransferStatus = 'in_transit' | 'received' | 'cancelled'

export interface TransferItem {
  product_id: string
  quantity: number
}

export interface Transfer {
  id: string
  reference: string
  source_store_id: string
  dest_store_id: string
  status: TransferStatus
  notes: string | null
  created_by: string
  received_by: string | null
  created_at: string
  received_at: string | null
  items: TransferItem[]
}

export type PaymentMethod = 'cash' | 'mobile_money' | 'card'
export type MobileProvider = 'wave' | 'orange_money' | 'mtn'

export interface Payment {
  method: PaymentMethod
  provider: MobileProvider | null
  amount: number
  amount_received: number | null
  change_given: number | null
}

export interface SaleItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  purchase_price: number
  vat_rate: number
  line_total: number
}

export interface Sale {
  id: string
  reference: string
  store_id: string
  cashier_id: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  status: 'completed' | 'refunded'
  created_at: string
  items: SaleItem[]
  payments: Payment[]
}

export type ReportStatus = 'draft' | 'submitted' | 'validated' | 'rejected'

export interface ReportExpense {
  id: string
  label: string
  category: string
  amount: number
}

export interface DailyReport {
  id: string
  store_id: string
  user_id: string
  report_date: string
  theoretical_amount: number
  declared_amount: number
  expenses_total: number
  variance: number
  variance_pct: number
  status: ReportStatus
  notes: string | null
  rejection_reason: string | null
  validated_by: string | null
  validated_at: string | null
  created_at: string
  expenses: ReportExpense[]
}

export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'daily_report'
  | 'cash_variance'
  | 'transfer'
  | 'report_status'

export interface AppNotification {
  id: string
  user_id: string | null
  store_id: string | null
  target_roles: Role[] | null
  type: NotificationType
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  read: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity: string
  entity_id: string | null
  details: string | null
  created_at: string
}

/* ---------- Inputs ---------- */

export interface CartLine {
  product_id: string
  quantity: number
}

export interface CreateSaleInput {
  store_id: string
  items: CartLine[]
  discount_amount: number
  payments: Payment[]
  supervisor_id?: string | null
}

export interface StockEntryInput {
  store_id: string
  product_id: string
  quantity: number
  lot_number: string
  expiry_date: string | null
  reference: string | null
}

export interface AdjustmentInput {
  store_id: string
  product_id: string
  /** Quantité signée : négative pour une sortie. */
  quantity: number
  reason: AdjustmentReason
  note: string
}

export interface CreateTransferInput {
  source_store_id: string
  dest_store_id: string
  items: TransferItem[]
  notes: string | null
}

export interface DailyReportInput {
  id?: string
  store_id: string
  report_date: string
  declared_amount: number
  notes: string | null
  expenses: Omit<ReportExpense, 'id'>[]
}

export interface UserInput extends Partial<Profile> {
  password?: string
}

export interface SalesFilter {
  from?: string
  to?: string
  store_id?: string
  cashier_id?: string
}
