import type { DataApi } from './api'
import { buildSeed, DB_VERSION, type DemoDb } from './seed'
import { computeSaleTotals, computeVariance, discountPercent, generateSku } from './logic'
import {
  can,
  CASH_VARIANCE_TOLERANCE,
  DISCOUNT_SUPERVISOR_THRESHOLD,
  inScope,
  storeScope,
} from '@/lib/permissions'
import type {
  AppNotification,
  DailyReport,
  Product,
  Profile,
  Role,
  Sale,
  StockMovement,
  Transfer,
} from '@/types'
import { uid } from '@/lib/utils'

const DB_KEY = 'mmcg-demo-db'
const SESSION_KEY = 'mmcg-demo-session'
const listeners = new Set<(t: string) => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mmcg-demo') : null
channel?.addEventListener('message', (e) => listeners.forEach((l) => l(String(e.data))))

let cache: DemoDb | null = null

function load(): DemoDb {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb
      if (parsed.version === DB_VERSION) return (cache = parsed)
    }
  } catch {
    /* stockage indisponible : on repart de la graine */
  }
  cache = buildSeed()
  persist()
  return cache
}

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache))
  } catch {
    /* quota dépassé ou navigation privée : on reste en mémoire */
  }
}

function commit(...tables: string[]) {
  persist()
  tables.forEach((t) => {
    listeners.forEach((l) => l(t))
    channel?.postMessage(t)
  })
}

export function resetDemoData() {
  cache = buildSeed()
  persist()
  ;['*'].forEach((t) => {
    listeners.forEach((l) => l(t))
    channel?.postMessage(t)
  })
}

const delay = <T,>(v: T, ms = 120) => new Promise<T>((res) => setTimeout(() => res(v), ms))
const clone = <T,>(v: T): T => structuredClone(v)
const nowIso = () => new Date().toISOString()

function sessionUser(): Profile | null {
  let userId: string | null = null
  try {
    userId = localStorage.getItem(SESSION_KEY)
  } catch {
    userId = null
  }
  if (!userId) return null
  const u = load().users.find((x) => x.id === userId && x.is_active)
  return u ? strip(u) : null
}

function me(): Profile {
  const u = sessionUser()
  if (!u) throw new Error('Session expirée, veuillez vous reconnecter.')
  return u
}

function strip(u: DemoDb['users'][number]): Profile {
  const { password: _pw, ...rest } = u
  void _pw
  return rest
}

function guard(role: Role, perm: Parameters<typeof can>[1]) {
  if (!can(role, perm)) throw new Error('Action non autorisée pour votre rôle (RLS).')
}

function requireStore(user: Profile, storeId: string) {
  if (!inScope(user, storeId)) throw new Error('Cette boutique est hors de votre périmètre (RLS).')
}

function audit(action: string, entity: string, entity_id: string | null, details: string) {
  const db = load()
  db.audit_logs.unshift({
    id: uid(),
    user_id: sessionUser()?.id ?? null,
    action,
    entity,
    entity_id,
    details,
    created_at: nowIso(),
  })
}

function notify(n: Omit<AppNotification, 'id' | 'created_at' | 'read' | 'user_id'> & { user_id?: string | null }) {
  load().notifications.unshift({ id: uid(), created_at: nowIso(), read: false, user_id: null, ...n })
}

function nextRef(prefix: string, existing: string[]) {
  const max = existing
    .map((r) => parseInt(r.replace(/\D/g, ''), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}-${String(max + 1).padStart(6, '0')}`
}

/** Applique un mouvement de stock (équivalent de la fonction SQL `apply_stock_movement`). */
function applyMovement(m: Omit<StockMovement, 'id' | 'created_at'>) {
  const db = load()
  let inv = db.inventory.find((i) => i.store_id === m.store_id && i.product_id === m.product_id)
  if (!inv) {
    inv = { id: uid(), store_id: m.store_id, product_id: m.product_id, quantity: 0, min_stock_level: null, updated_at: nowIso() }
    db.inventory.push(inv)
  }
  const next = inv.quantity + m.quantity
  if (next < 0) {
    const p = db.products.find((x) => x.id === m.product_id)
    throw new Error(`Stock insuffisant pour « ${p?.name ?? 'produit'} » (disponible : ${inv.quantity}).`)
  }
  const before = inv.quantity
  inv.quantity = next
  inv.updated_at = nowIso()
  db.movements.unshift({ ...m, id: uid(), created_at: nowIso() })
  stockAlertTrigger(m.store_id, m.product_id, before, next, inv.min_stock_level)
}

/** Équivalent du trigger `trg_inventory_alerts`. */
function stockAlertTrigger(storeId: string, productId: string, before: number, after: number, storeMin: number | null) {
  const db = load()
  const p = db.products.find((x) => x.id === productId)
  const s = db.stores.find((x) => x.id === storeId)
  if (!p || !s) return
  const min = storeMin ?? p.min_stock_level
  const roles: Role[] = ['super_admin', 'store_admin', 'store_manager', 'stock_manager']
  if (after === 0 && before > 0) {
    notify({ type: 'out_of_stock', severity: 'critical', title: 'Rupture de stock', message: `${p.name} est épuisé à ${s.name}.`, store_id: storeId, target_roles: roles })
  } else if (after <= min && before > min) {
    notify({ type: 'low_stock', severity: 'warning', title: 'Stock faible', message: `${p.name} : ${after} unité(s) restante(s) à ${s.name}.`, store_id: storeId, target_roles: roles })
  }
}

function visibleNotification(n: AppNotification, user: Profile) {
  if (n.user_id) return n.user_id === user.id
  if (n.target_roles && !n.target_roles.includes(user.role)) return false
  return n.store_id ? inScope(user, n.store_id) : true
}

function theoretical(db: DemoDb, storeId: string, date: string) {
  return db.sales
    .filter((s) => s.store_id === storeId && s.status === 'completed' && toLocalDate(s.created_at) === date)
    .reduce((a, s) => a + s.total, 0)
}

function toLocalDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const demoApi: DataApi = {
  mode: 'demo',

  /* ---------------- Auth ---------------- */
  async signIn(email, password) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.password !== password) throw new Error('Email ou mot de passe incorrect.')
    if (!u.is_active) throw new Error('Ce compte est désactivé. Contactez votre administrateur.')
    u.last_login_at = nowIso()
    localStorage.setItem(SESSION_KEY, u.id)
    load().audit_logs.unshift({ id: uid(), user_id: u.id, action: 'LOGIN', entity: 'auth', entity_id: u.id, details: 'Connexion', created_at: nowIso() })
    commit('users')
    return delay(strip(u), 300)
  },
  async signOut() {
    localStorage.removeItem(SESSION_KEY)
  },
  async currentUser() {
    return sessionUser()
  },
  async requestPasswordReset(email) {
    const exists = load().users.some((u) => u.email.toLowerCase() === email.toLowerCase())
    void exists // ne révèle jamais si l'email existe
    return delay(undefined, 400)
  },
  async updatePassword(password) {
    const user = me()
    if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.')
    const u = load().users.find((x) => x.id === user.id)!
    u.password = password
    commit('users')
  },
  async verifySupervisor(email, password) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.password !== password || !u.is_active) throw new Error('Identifiants superviseur invalides.')
    if (!can(u.role, 'discount.approve')) throw new Error('Ce compte ne peut pas autoriser une remise.')
    return delay(strip(u), 250)
  },
  async updateOwnProfile(input) {
    const user = me()
    const u = load().users.find((x) => x.id === user.id)!
    Object.assign(u, input)
    commit('users')
    return strip(u)
  },

  /* ---------------- Boutiques & utilisateurs ---------------- */
  async listStores() {
    return delay(clone(load().stores))
  },
  async saveStore(input) {
    const user = me()
    guard(user.role, 'stores.edit')
    const db = load()
    if (db.stores.some((s) => s.code === input.code && s.id !== input.id)) throw new Error('Ce code boutique existe déjà.')
    if (input.id) {
      const s = db.stores.find((x) => x.id === input.id)!
      Object.assign(s, input)
      audit('UPDATE', 'stores', s.id, `Modification de ${s.name}`)
      commit('stores', 'audit_logs')
      return clone(s)
    }
    const s = {
      id: uid(), code: '', name: '', address: '', phone: '', email: '', region: '', manager_id: null, is_active: true,
      created_at: nowIso(), ...input,
    } as DemoDb['stores'][number]
    db.stores.push(s)
    db.products.forEach((p) =>
      db.inventory.push({ id: uid(), store_id: s.id, product_id: p.id, quantity: 0, min_stock_level: null, updated_at: nowIso() }),
    )
    audit('INSERT', 'stores', s.id, `Création de ${s.name}`)
    commit('stores', 'inventory', 'audit_logs')
    return clone(s)
  },
  async listUsers() {
    const user = me()
    guard(user.role, 'users.manage')
    const scope = storeScope(user)
    const list = load().users.filter(
      (u) => scope === null || (u.store_id && scope.includes(u.store_id)) || u.id === user.id,
    )
    return delay(list.map(strip))
  },
  async saveUser(input) {
    const user = me()
    guard(user.role, 'users.manage')
    const db = load()
    const email = input.email?.trim().toLowerCase()
    if (email && db.users.some((u) => u.email === email && u.id !== input.id)) throw new Error('Cet email est déjà utilisé.')
    if (user.role !== 'super_admin') {
      if (input.role && !['store_manager', 'cashier', 'stock_manager'].includes(input.role))
        throw new Error('Vous ne pouvez pas attribuer ce rôle.')
      if (input.store_id) requireStore(user, input.store_id)
    }
    const { password, ...rest } = input
    if (input.id) {
      const u = db.users.find((x) => x.id === input.id)!
      Object.assign(u, rest, email ? { email } : {})
      if (password) u.password = password
      audit('UPDATE', 'users', u.id, `Modification du compte ${u.email}`)
      commit('users', 'audit_logs')
      return strip(u)
    }
    if (!password || password.length < 8) throw new Error('Mot de passe initial : 8 caractères minimum.')
    const u = {
      id: uid(), first_name: '', last_name: '', email: email ?? '', phone: null, role: 'cashier' as Role, store_id: null,
      store_ids: [], is_active: true, last_login_at: null, created_at: nowIso(), ...rest, password,
    }
    u.email = email ?? ''
    db.users.push(u)
    audit('INSERT', 'users', u.id, `Création du compte ${u.email} (${u.role})`)
    commit('users', 'audit_logs')
    return strip(u)
  },
  async setUserActive(id, active) {
    const user = me()
    guard(user.role, 'users.manage')
    if (id === user.id) throw new Error('Vous ne pouvez pas désactiver votre propre compte.')
    const u = load().users.find((x) => x.id === id)!
    u.is_active = active
    audit(active ? 'ENABLE' : 'DISABLE', 'users', id, `${active ? 'Réactivation' : 'Désactivation'} de ${u.email}`)
    commit('users', 'audit_logs')
  },

  /* ---------------- Référentiels ---------------- */
  async listCategories() {
    return delay(clone(load().categories))
  },
  async saveCategory(input) {
    guard(me().role, 'catalog.settings')
    const db = load()
    if (input.id) {
      const c = db.categories.find((x) => x.id === input.id)!
      Object.assign(c, input)
      commit('categories')
      return clone(c)
    }
    const c = { id: uid(), name: '', code: '', parent_id: null, ...input }
    c.code = c.code.toUpperCase().slice(0, 3)
    db.categories.push(c)
    commit('categories')
    return clone(c)
  },
  async deleteCategory(id) {
    guard(me().role, 'catalog.settings')
    const db = load()
    if (db.products.some((p) => p.category_id === id)) throw new Error('Catégorie utilisée par des produits.')
    db.categories = db.categories.filter((c) => c.id !== id)
    commit('categories')
  },
  async listSuppliers() {
    return delay(clone(load().suppliers))
  },
  async saveSupplier(input) {
    guard(me().role, 'catalog.settings')
    const db = load()
    if (input.id) {
      const s = db.suppliers.find((x) => x.id === input.id)!
      Object.assign(s, input)
      commit('suppliers')
      return clone(s)
    }
    const s = { id: uid(), name: '', contact_name: '', phone: '', email: '', address: '', ...input }
    db.suppliers.push(s)
    commit('suppliers')
    return clone(s)
  },
  async deleteSupplier(id) {
    guard(me().role, 'catalog.settings')
    const db = load()
    if (db.products.some((p) => p.supplier_id === id)) throw new Error('Fournisseur associé à des produits.')
    db.suppliers = db.suppliers.filter((c) => c.id !== id)
    commit('suppliers')
  },

  /* ---------------- Produits ---------------- */
  async listProducts() {
    return delay(clone(load().products))
  },
  async saveProduct(input) {
    const user = me()
    guard(user.role, 'products.edit')
    const db = load()
    if ((input.purchase_price ?? 0) < 0) throw new Error('Prix d’achat invalide.')
    if (input.barcode && db.products.some((p) => p.barcode === input.barcode && p.id !== input.id))
      throw new Error('Ce code-barres est déjà attribué.')
    if (input.id) {
      const p = db.products.find((x) => x.id === input.id)!
      const changes: string[] = []
      if (input.selling_price !== undefined && input.selling_price !== p.selling_price)
        changes.push(`Prix de vente : ${p.selling_price} → ${input.selling_price}`)
      if (input.purchase_price !== undefined && input.purchase_price !== p.purchase_price)
        changes.push(`Prix d’achat : ${p.purchase_price} → ${input.purchase_price}`)
      Object.assign(p, input)
      audit('UPDATE', 'products', p.id, changes.join(' · ') || `Modification de ${p.name}`)
      commit('products', 'audit_logs')
      return clone(p)
    }
    const cat = db.categories.find((c) => c.id === input.category_id)
    const p: Product = {
      id: uid(), sku: generateSku(cat?.code ?? 'GEN', db.products.map((x) => x.sku)), barcode: null, name: '', brand: '',
      description: '', packaging: '', category_id: null, supplier_id: null, purchase_price: 0, selling_price: 0, vat_rate: 18,
      min_stock_level: 5, image_url: null, is_active: true, created_at: nowIso(), ...input,
    } as Product
    if (!input.sku) p.sku = generateSku(cat?.code ?? 'GEN', db.products.map((x) => x.sku))
    db.products.push(p)
    db.stores.forEach((s) =>
      db.inventory.push({ id: uid(), store_id: s.id, product_id: p.id, quantity: 0, min_stock_level: null, updated_at: nowIso() }),
    )
    audit('INSERT', 'products', p.id, `Création de ${p.name} (${p.sku})`)
    commit('products', 'inventory', 'audit_logs')
    return clone(p)
  },
  async uploadProductImage(file) {
    if (file.size > 1_500_000) throw new Error('Image trop lourde pour le mode démo (1,5 Mo max).')
    return new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(String(reader.result))
      reader.onerror = () => rej(new Error('Lecture du fichier impossible.'))
      reader.readAsDataURL(file)
    })
  },

  /* ---------------- Stock ---------------- */
  async listInventory() {
    const user = me()
    const scope = storeScope(user)
    return delay(clone(load().inventory.filter((i) => scope === null || scope.includes(i.store_id))))
  },
  async setStoreMinLevel(storeId, productId, min) {
    const user = me()
    guard(user.role, 'inventory.adjust')
    requireStore(user, storeId)
    const inv = load().inventory.find((i) => i.store_id === storeId && i.product_id === productId)
    if (inv) inv.min_stock_level = min
    commit('inventory')
  },
  async listMovements(limit = 500) {
    const user = me()
    const scope = storeScope(user)
    return delay(clone(load().movements.filter((m) => scope === null || scope.includes(m.store_id)).slice(0, limit)))
  },
  async stockEntry(input) {
    const user = me()
    guard(user.role, 'inventory.move')
    requireStore(user, input.store_id)
    if (input.quantity <= 0) throw new Error('La quantité doit être positive.')
    if (!input.lot_number.trim()) throw new Error('Le numéro de lot est obligatoire.')
    applyMovement({
      product_id: input.product_id, store_id: input.store_id, user_id: user.id, type: 'entry', quantity: input.quantity,
      reason: 'Réception marchandise', lot_number: input.lot_number, expiry_date: input.expiry_date, reference: input.reference,
    })
    commit('inventory', 'movements', 'notifications')
  },
  async adjustStock(input) {
    const user = me()
    guard(user.role, 'inventory.adjust')
    requireStore(user, input.store_id)
    if (!input.quantity) throw new Error('Quantité nulle.')
    applyMovement({
      product_id: input.product_id, store_id: input.store_id, user_id: user.id, type: 'adjustment', quantity: input.quantity,
      reason: `${input.reason}${input.note ? ` — ${input.note}` : ''}`, lot_number: null, expiry_date: null, reference: null,
    })
    audit('ADJUST', 'inventory', input.product_id, `Ajustement ${input.quantity > 0 ? '+' : ''}${input.quantity} (${input.reason})`)
    commit('inventory', 'movements', 'notifications', 'audit_logs')
  },
  async listTransfers() {
    const user = me()
    const scope = storeScope(user)
    return delay(
      clone(
        load()
          .transfers.filter((t) => scope === null || scope.includes(t.source_store_id) || scope.includes(t.dest_store_id))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      ),
    )
  },
  async createTransfer(input) {
    const user = me()
    guard(user.role, 'transfers.create')
    requireStore(user, input.source_store_id)
    if (input.source_store_id === input.dest_store_id) throw new Error('Boutiques source et destination identiques.')
    const items = input.items.filter((i) => i.quantity > 0)
    if (!items.length) throw new Error('Ajoutez au moins un article.')
    const db = load()
    items.forEach((it) => {
      const inv = db.inventory.find((i) => i.store_id === input.source_store_id && i.product_id === it.product_id)
      const reserved = db.transfers
        .filter((t) => t.status === 'in_transit' && t.source_store_id === input.source_store_id)
        .flatMap((t) => t.items)
        .filter((x) => x.product_id === it.product_id)
        .reduce((a, x) => a + x.quantity, 0)
      if (!inv || inv.quantity - reserved < it.quantity) {
        const p = db.products.find((x) => x.id === it.product_id)
        throw new Error(`Stock disponible insuffisant pour « ${p?.name} » (${(inv?.quantity ?? 0) - reserved}).`)
      }
    })
    const t: Transfer = {
      id: uid(), reference: nextRef('TRF', db.transfers.map((x) => x.reference)), source_store_id: input.source_store_id,
      dest_store_id: input.dest_store_id, status: 'in_transit', notes: input.notes, created_by: user.id, received_by: null,
      created_at: nowIso(), received_at: null, items,
    }
    db.transfers.unshift(t)
    const src = db.stores.find((s) => s.id === t.source_store_id)?.name
    const dst = db.stores.find((s) => s.id === t.dest_store_id)?.name
    notify({ type: 'transfer', severity: 'info', title: 'Transfert en transit', message: `${t.reference} : ${src} → ${dst}. À réceptionner.`, store_id: t.dest_store_id, target_roles: ['super_admin', 'store_admin', 'store_manager', 'stock_manager'] })
    audit('INSERT', 'stock_transfers', t.id, `Expédition ${t.reference}`)
    commit('transfers', 'notifications', 'audit_logs')
    return clone(t)
  },
  async receiveTransfer(id) {
    const user = me()
    guard(user.role, 'transfers.receive')
    const db = load()
    const t = db.transfers.find((x) => x.id === id)
    if (!t || t.status !== 'in_transit') throw new Error('Transfert introuvable ou déjà traité.')
    requireStore(user, t.dest_store_id)
    // Transaction atomique : on travaille sur une copie et on ne remplace qu'en cas de succès.
    const snapshot = structuredClone(db)
    try {
      t.items.forEach((it) => {
        applyMovement({ product_id: it.product_id, store_id: t.source_store_id, user_id: user.id, type: 'transfer_out', quantity: -it.quantity, reason: null, lot_number: null, expiry_date: null, reference: t.reference })
        applyMovement({ product_id: it.product_id, store_id: t.dest_store_id, user_id: user.id, type: 'transfer_in', quantity: it.quantity, reason: null, lot_number: null, expiry_date: null, reference: t.reference })
      })
      t.status = 'received'
      t.received_by = user.id
      t.received_at = nowIso()
      audit('RECEIVE', 'stock_transfers', t.id, `Réception ${t.reference}`)
    } catch (e) {
      cache = snapshot
      throw e
    }
    commit('transfers', 'inventory', 'movements', 'notifications', 'audit_logs')
  },
  async cancelTransfer(id) {
    const user = me()
    guard(user.role, 'transfers.create')
    const t = load().transfers.find((x) => x.id === id)
    if (!t || t.status !== 'in_transit') throw new Error('Seuls les transferts en transit peuvent être annulés.')
    requireStore(user, t.source_store_id)
    t.status = 'cancelled'
    audit('CANCEL', 'stock_transfers', t.id, `Annulation ${t.reference}`)
    commit('transfers', 'audit_logs')
  },

  /* ---------------- Ventes ---------------- */
  async listSales(filter = {}) {
    const user = me()
    const scope = storeScope(user)
    let list = load().sales.filter((s) => scope === null || scope.includes(s.store_id))
    if (user.role === 'cashier') list = list.filter((s) => s.cashier_id === user.id)
    if (filter.store_id) list = list.filter((s) => s.store_id === filter.store_id)
    if (filter.cashier_id) list = list.filter((s) => s.cashier_id === filter.cashier_id)
    if (filter.from) list = list.filter((s) => toLocalDate(s.created_at) >= filter.from!)
    if (filter.to) list = list.filter((s) => toLocalDate(s.created_at) <= filter.to!)
    return delay(clone(list), 80)
  },
  async createSale(input) {
    const user = me()
    guard(user.role, 'pos')
    requireStore(user, input.store_id)
    const db = load()
    const map = new Map(db.products.map((p) => [p.id, p]))
    const t = computeSaleTotals(input.items, map, input.discount_amount)
    if (!t.items.length) throw new Error('Le panier est vide.')
    const pct = discountPercent(t.subtotal, t.discount_amount)
    if (pct > DISCOUNT_SUPERVISOR_THRESHOLD && !can(user.role, 'discount.approve')) {
      const sup = db.users.find((u) => u.id === input.supervisor_id)
      if (!sup || !can(sup.role, 'discount.approve')) throw new Error('Remise > 15 % : validation superviseur requise.')
    }
    const paid = input.payments.reduce((a, p) => a + p.amount, 0)
    if (Math.round(paid) !== Math.round(t.total)) throw new Error('Le montant réglé ne correspond pas au total.')
    const snapshot = structuredClone(db)
    const ref = nextRef('TK', db.sales.slice(0, 50).map((s) => s.reference))
    const store = db.stores.find((s) => s.id === input.store_id)!
    const sale: Sale = {
      id: uid(), reference: ref.replace('TK-', `TK-${store.code.slice(4)}-`), store_id: input.store_id, cashier_id: user.id,
      subtotal: t.subtotal, discount_amount: t.discount_amount, tax_amount: t.tax_amount, total: t.total, status: 'completed',
      created_at: nowIso(), items: t.items, payments: input.payments,
    }
    try {
      t.items.forEach((it) =>
        applyMovement({ product_id: it.product_id, store_id: input.store_id, user_id: user.id, type: 'sale', quantity: -it.quantity, reason: null, lot_number: null, expiry_date: null, reference: sale.reference }),
      )
    } catch (e) {
      cache = snapshot
      throw e
    }
    db.sales.unshift(sale)
    if (pct > DISCOUNT_SUPERVISOR_THRESHOLD)
      audit('DISCOUNT', 'sales', sale.id, `Remise de ${pct.toFixed(1)} % sur ${sale.reference}`)
    commit('sales', 'inventory', 'movements', 'notifications', 'audit_logs')
    return delay(clone(sale), 150)
  },

  /* ---------------- Déclarations journalières ---------------- */
  async listDailyReports() {
    const user = me()
    guard(user.role, 'reports.daily.view')
    const scope = storeScope(user)
    return delay(
      clone(
        load()
          .daily_reports.filter((r) => scope === null || scope.includes(r.store_id))
          .sort((a, b) => b.report_date.localeCompare(a.report_date) || b.created_at.localeCompare(a.created_at)),
      ),
    )
  },
  async theoreticalAmount(storeId, date) {
    const user = me()
    requireStore(user, storeId)
    return theoretical(load(), storeId, date)
  },
  async saveDailyReport(input) {
    const user = me()
    guard(user.role, 'reports.daily.edit')
    requireStore(user, input.store_id)
    const db = load()
    const theo = theoretical(db, input.store_id, input.report_date)
    const expenses = input.expenses.filter((e) => e.label && e.amount > 0).map((e) => ({ ...e, id: uid() }))
    const expTotal = expenses.reduce((a, e) => a + e.amount, 0)
    const v = computeVariance(theo, input.declared_amount, expTotal)
    if (input.id) {
      const r = db.daily_reports.find((x) => x.id === input.id)!
      if (!['draft', 'rejected'].includes(r.status)) throw new Error('Une déclaration envoyée ne peut plus être modifiée.')
      Object.assign(r, {
        report_date: input.report_date, declared_amount: input.declared_amount, notes: input.notes, expenses,
        theoretical_amount: theo, expenses_total: expTotal, ...v, status: 'draft', rejection_reason: null,
      })
      commit('daily_reports')
      return clone(r)
    }
    if (db.daily_reports.some((r) => r.store_id === input.store_id && r.report_date === input.report_date))
      throw new Error('Une déclaration existe déjà pour cette boutique à cette date.')
    const r: DailyReport = {
      id: uid(), store_id: input.store_id, user_id: user.id, report_date: input.report_date, theoretical_amount: theo,
      declared_amount: input.declared_amount, expenses_total: expTotal, ...v, status: 'draft', notes: input.notes,
      rejection_reason: null, validated_by: null, validated_at: null, created_at: nowIso(), expenses,
    }
    db.daily_reports.unshift(r)
    commit('daily_reports')
    return clone(r)
  },
  async submitDailyReport(id) {
    const user = me()
    guard(user.role, 'reports.daily.edit')
    const db = load()
    const r = db.daily_reports.find((x) => x.id === id)!
    requireStore(user, r.store_id)
    if (!['draft', 'rejected'].includes(r.status)) throw new Error('Déclaration déjà envoyée.')
    // Recalcul au moment de l'envoi (les ventes ont pu évoluer)
    r.theoretical_amount = theoretical(db, r.store_id, r.report_date)
    Object.assign(r, computeVariance(r.theoretical_amount, r.declared_amount, r.expenses_total))
    r.status = 'submitted'
    const store = db.stores.find((s) => s.id === r.store_id)!
    notify({ type: 'daily_report', severity: 'info', title: 'Nouvelle déclaration', message: `${user.first_name} ${user.last_name} a soumis la déclaration du ${r.report_date} — ${store.name}.`, store_id: r.store_id, target_roles: ['super_admin', 'store_admin'] })
    if (Math.abs(r.variance_pct) > CASH_VARIANCE_TOLERANCE)
      notify({ type: 'cash_variance', severity: 'critical', title: 'Écart de caisse', message: `Écart de ${r.variance_pct.toFixed(1)} % (${Math.round(r.variance)} F) sur ${store.name} le ${r.report_date}.`, store_id: r.store_id, target_roles: ['super_admin', 'store_admin'] })
    audit('SUBMIT', 'daily_reports', r.id, `Déclaration ${store.code} du ${r.report_date}`)
    commit('daily_reports', 'notifications', 'audit_logs')
  },
  async validateDailyReport(id) {
    const user = me()
    guard(user.role, 'reports.daily.validate')
    const r = load().daily_reports.find((x) => x.id === id)!
    requireStore(user, r.store_id)
    if (r.status !== 'submitted') throw new Error('Seules les déclarations envoyées peuvent être validées.')
    Object.assign(r, { status: 'validated', validated_by: user.id, validated_at: nowIso() })
    notify({ type: 'report_status', severity: 'info', title: 'Déclaration validée', message: `Votre déclaration du ${r.report_date} a été validée.`, store_id: r.store_id, target_roles: null, user_id: r.user_id })
    audit('VALIDATE', 'daily_reports', r.id, 'Déclaration validée')
    commit('daily_reports', 'notifications', 'audit_logs')
  },
  async rejectDailyReport(id, reason) {
    const user = me()
    guard(user.role, 'reports.daily.validate')
    if (!reason.trim()) throw new Error('Le motif de rejet est obligatoire.')
    const r = load().daily_reports.find((x) => x.id === id)!
    requireStore(user, r.store_id)
    if (r.status !== 'submitted') throw new Error('Seules les déclarations envoyées peuvent être rejetées.')
    Object.assign(r, { status: 'rejected', rejection_reason: reason, validated_by: user.id, validated_at: nowIso() })
    notify({ type: 'report_status', severity: 'warning', title: 'Déclaration rejetée', message: `Déclaration du ${r.report_date} à corriger : ${reason}`, store_id: r.store_id, target_roles: null, user_id: r.user_id })
    audit('REJECT', 'daily_reports', r.id, reason)
    commit('daily_reports', 'notifications', 'audit_logs')
  },

  /* ---------------- Notifications & audit ---------------- */
  async listNotifications() {
    const user = me()
    return delay(clone(load().notifications.filter((n) => visibleNotification(n, user)).slice(0, 100)), 60)
  },
  async markNotificationRead(id) {
    const n = load().notifications.find((x) => x.id === id)
    if (n) n.read = true
    commit('notifications')
  },
  async markAllNotificationsRead() {
    const user = me()
    load().notifications.forEach((n) => visibleNotification(n, user) && (n.read = true))
    commit('notifications')
  },
  async listAuditLogs() {
    guard(me().role, 'audit')
    return delay(clone(load().audit_logs.slice(0, 500)))
  },

  subscribe(onChange) {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  },
}
