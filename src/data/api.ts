import type {
  AdjustmentInput,
  AppNotification,
  AuditLog,
  Category,
  CreateSaleInput,
  CreateTransferInput,
  DailyReport,
  DailyReportInput,
  InventoryItem,
  Product,
  Profile,
  Sale,
  SalesFilter,
  StockEntryInput,
  StockMovement,
  Store,
  Supplier,
  Transfer,
  UserInput,
} from '@/types'

/**
 * Contrat d'accès aux données. Deux implémentations :
 *  - `supabaseApi` : production (PostgreSQL + RLS + fonctions RPC)
 *  - `demoApi`     : mode démo hors-ligne (localStorage, RLS émulée)
 */
export interface DataApi {
  mode: 'supabase' | 'demo'

  // Auth
  signIn(email: string, password: string): Promise<Profile>
  signOut(): Promise<void>
  currentUser(): Promise<Profile | null>
  requestPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  verifySupervisor(email: string, password: string): Promise<Profile>
  updateOwnProfile(input: Pick<Profile, 'first_name' | 'last_name' | 'phone'>): Promise<Profile>

  // Référentiels
  listStores(): Promise<Store[]>
  saveStore(input: Partial<Store>): Promise<Store>
  listUsers(): Promise<Profile[]>
  saveUser(input: UserInput): Promise<Profile>
  setUserActive(id: string, active: boolean): Promise<void>
  listCategories(): Promise<Category[]>
  saveCategory(input: Partial<Category>): Promise<Category>
  deleteCategory(id: string): Promise<void>
  listSuppliers(): Promise<Supplier[]>
  saveSupplier(input: Partial<Supplier>): Promise<Supplier>
  deleteSupplier(id: string): Promise<void>

  // Catalogue
  listProducts(): Promise<Product[]>
  saveProduct(input: Partial<Product>): Promise<Product>
  uploadProductImage(file: File): Promise<string>

  // Stock
  listInventory(): Promise<InventoryItem[]>
  setStoreMinLevel(storeId: string, productId: string, min: number | null): Promise<void>
  listMovements(limit?: number): Promise<StockMovement[]>
  stockEntry(input: StockEntryInput): Promise<void>
  adjustStock(input: AdjustmentInput): Promise<void>
  listTransfers(): Promise<Transfer[]>
  createTransfer(input: CreateTransferInput): Promise<Transfer>
  receiveTransfer(id: string): Promise<void>
  cancelTransfer(id: string): Promise<void>

  // Ventes
  listSales(filter?: SalesFilter): Promise<Sale[]>
  createSale(input: CreateSaleInput): Promise<Sale>

  // Déclarations journalières
  listDailyReports(): Promise<DailyReport[]>
  theoreticalAmount(storeId: string, date: string): Promise<number>
  saveDailyReport(input: DailyReportInput): Promise<DailyReport>
  submitDailyReport(id: string): Promise<void>
  validateDailyReport(id: string): Promise<void>
  rejectDailyReport(id: string, reason: string): Promise<void>

  // Notifications & audit
  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  markAllNotificationsRead(): Promise<void>
  listAuditLogs(): Promise<AuditLog[]>

  /** Abonnement aux changements (temps réel). Retourne une fonction de désabonnement. */
  subscribe(onChange: (table: string) => void): () => void
}
