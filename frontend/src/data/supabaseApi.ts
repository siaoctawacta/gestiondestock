import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DataApi } from './api'
import type {
  AppNotification,
  DailyReport,
  InventoryItem,
  Profile,
  Sale,
  Transfer,
} from '@/types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let client: SupabaseClient | null = null
export function supabase() {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: localStorage },
    })
  }
  return client
}

// Sans types générés (supabase gen types), les lignes sont non typées : on les
// convertit vers les types du domaine dans les fonctions map*.
function check(res: { data: unknown; error: { message: string } | null }): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

async function loadProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase().from('users').select('*, user_stores(store_id)').eq('id', id).maybeSingle()
  return data ? mapProfile(data) : null
}

function mapProfile(r: Row): Profile {
  return {
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    phone: r.phone,
    role: r.role_id,
    store_id: r.store_id,
    store_ids: (r.user_stores ?? []).map((s: Row) => s.store_id),
    is_active: r.is_active,
    last_login_at: r.last_login_at,
    created_at: r.created_at,
    deleted_at: r.deleted_at ?? null,
  }
}

function mapSale(r: Row): Sale {
  return {
    id: r.id,
    reference: r.reference,
    store_id: r.store_id,
    cashier_id: r.cashier_id,
    subtotal: num(r.subtotal),
    discount_amount: num(r.discount_amount),
    tax_amount: num(r.tax_amount),
    total: num(r.total),
    status: r.status,
    created_at: r.created_at,
    items: (r.sale_items ?? []).map((i: Row) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: num(i.unit_price),
      purchase_price: num(i.purchase_price),
      vat_rate: num(i.vat_rate),
      line_total: num(i.line_total),
    })),
    payments: (r.payments ?? []).map((p: Row) => ({
      method: p.method,
      provider: p.provider,
      amount: num(p.amount),
      amount_received: p.amount_received === null ? null : num(p.amount_received),
      change_given: p.change_given === null ? null : num(p.change_given),
    })),
  }
}

function mapReport(r: Row): DailyReport {
  return {
    ...(r as DailyReport),
    theoretical_amount: num(r.theoretical_amount),
    declared_amount: num(r.declared_amount),
    expenses_total: num(r.expenses_total),
    variance: num(r.variance),
    variance_pct: num(r.variance_pct),
    expenses: (r.report_expenses ?? []).map((e: Row) => ({ ...e, amount: num(e.amount) })),
  }
}

async function fnCall<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null
    throw new Error(msg ?? error.message)
  }
  return data as T
}

async function uid() {
  const { data } = await supabase().auth.getUser()
  if (!data.user) throw new Error('Session expirée')
  return data.user.id
}

export const supabaseApi: DataApi = {
  mode: 'supabase',

  async signIn(email, password) {
    check(await supabase().auth.signInWithPassword({ email, password }))
    const { data } = await supabase().auth.getUser()
    const profile = data.user ? await loadProfile(data.user.id) : null
    if (!profile) throw new Error('Profil utilisateur introuvable.')
    if (!profile.is_active) {
      await supabase().auth.signOut()
      throw new Error('Ce compte est désactivé. Contactez votre administrateur.')
    }
    await supabase().rpc('touch_last_login')
    return profile
  },
  async signOut() {
    await supabase().auth.signOut()
  },
  async currentUser() {
    const { data } = await supabase().auth.getSession()
    if (!data.session) return null
    const p = await loadProfile(data.session.user.id)
    return p?.is_active ? p : null
  },
  async requestPasswordReset(email) {
    check(
      await supabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    )
  },
  async updatePassword(password) {
    check(await supabase().auth.updateUser({ password }))
  },
  async resetPasswordWithToken(_token, _email, password) {
    // Supabase ouvre une session de récupération depuis le lien : il suffit de changer le mot de passe.
    check(await supabase().auth.updateUser({ password }))
  },
  async verifySupervisor(email, password) {
    const res = await fnCall<{ profile: Row }>('verify-supervisor', { email, password })
    return mapProfile(res.profile)
  },
  async updateOwnProfile(input) {
    const id = await uid()
    check(await supabase().from('users').update(input).eq('id', id))
    return (await loadProfile(id))!
  },

  async listStores() {
    return check(await supabase().from('stores').select('*').order('name'))
  },
  async saveStore(input) {
    const q = input.id
      ? supabase().from('stores').update(input).eq('id', input.id)
      : supabase().from('stores').insert(input)
    return check(await q.select().single())
  },
  async deleteStore(id) {
    check(await supabase().rpc('delete_store', { p_store: id }))
  },
  async listUsers() {
    const rows = check(await supabase().from('users').select('*, user_stores(store_id)').order('last_name'))
    return rows.map(mapProfile)
  },
  async saveUser(input) {
    const res = await fnCall<{ id: string }>('admin-users', input)
    return (await loadProfile(res.id))!
  },
  async setUserActive(id, active) {
    await fnCall('admin-users', { id, is_active: active })
  },
  async deleteUser(id) {
    await fnCall('admin-users', { id, delete: true })
  },

  async listCategories() {
    return check(await supabase().from('categories').select('*').order('name'))
  },
  async saveCategory(input) {
    const q = input.id
      ? supabase().from('categories').update(input).eq('id', input.id)
      : supabase().from('categories').insert({ ...input, code: input.code?.toUpperCase().slice(0, 3) })
    return check(await q.select().single())
  },
  async deleteCategory(id) {
    check(await supabase().from('categories').delete().eq('id', id))
  },
  async listSuppliers() {
    return check(await supabase().from('suppliers').select('*').order('name'))
  },
  async saveSupplier(input) {
    const q = input.id
      ? supabase().from('suppliers').update(input).eq('id', input.id)
      : supabase().from('suppliers').insert(input)
    return check(await q.select().single())
  },
  async deleteSupplier(id) {
    check(await supabase().from('suppliers').delete().eq('id', id))
  },

  async listProducts() {
    const rows = check(await supabase().from('products').select('*').order('name'))
    return rows.map((p: Row) => ({
      ...p,
      purchase_price: num(p.purchase_price),
      selling_price: num(p.selling_price),
      vat_rate: num(p.vat_rate),
    }))
  },
  async saveProduct(input) {
    const { id, ...rest } = input
    const payload = id ? rest : { ...rest, sku: rest.sku || '' }
    const q = id
      ? supabase().from('products').update(payload).eq('id', id)
      : supabase().from('products').insert(payload)
    return check(await q.select().single())
  },
  async uploadProductImage(file) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    check(await supabase().storage.from('product-images').upload(path, file, { upsert: false }))
    return supabase().storage.from('product-images').getPublicUrl(path).data.publicUrl
  },

  async listInventory() {
    // Pagination : PostgREST renvoie 1000 lignes max par défaut
    const all: InventoryItem[] = []
    for (let from = 0; ; from += 1000) {
      const page = check(await supabase().from('inventory').select('*').range(from, from + 999))
      all.push(...page)
      if (page.length < 1000) break
    }
    return all
  },
  async setStoreMinLevel(storeId, productId, min) {
    check(
      await supabase()
        .from('inventory')
        .update({ min_stock_level: min })
        .eq('store_id', storeId)
        .eq('product_id', productId),
    )
  },
  async listMovements(limit = 500) {
    return check(
      await supabase().from('stock_movements').select('*').order('created_at', { ascending: false }).limit(limit),
    )
  },
  async stockEntry(i) {
    check(
      await supabase().rpc('stock_entry', {
        p_store: i.store_id,
        p_product: i.product_id,
        p_qty: i.quantity,
        p_lot: i.lot_number,
        p_expiry: i.expiry_date,
        p_reference: i.reference,
      }),
    )
  },
  async adjustStock(i) {
    check(
      await supabase().rpc('adjust_stock', {
        p_store: i.store_id,
        p_product: i.product_id,
        p_qty: i.quantity,
        p_reason: i.reason,
        p_note: i.note,
      }),
    )
  },
  async listTransfers() {
    const rows = check(
      await supabase()
        .from('stock_transfers')
        .select('*, transfer_items(product_id, quantity)')
        .order('created_at', { ascending: false }),
    )
    return rows.map((r: Row): Transfer => ({ ...(r as Transfer), items: r.transfer_items ?? [] }))
  },
  async createTransfer(i) {
    const id = check(
      await supabase().rpc('create_transfer', {
        p_source: i.source_store_id,
        p_dest: i.dest_store_id,
        p_items: i.items,
        p_notes: i.notes,
      }),
    ) as string
    const t = check(
      await supabase().from('stock_transfers').select('*, transfer_items(product_id, quantity)').eq('id', id).single(),
    )
    return { ...(t as Transfer), items: t.transfer_items }
  },
  async receiveTransfer(id) {
    check(await supabase().rpc('receive_transfer', { p_transfer: id }))
  },
  async cancelTransfer(id) {
    check(await supabase().rpc('cancel_transfer', { p_transfer: id }))
  },

  async listSales(filter = {}) {
    let q = supabase()
      .from('sales')
      .select('*, sale_items(*), payments(*)')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (filter.store_id) q = q.eq('store_id', filter.store_id)
    if (filter.cashier_id) q = q.eq('cashier_id', filter.cashier_id)
    if (filter.from) q = q.gte('created_at', `${filter.from}T00:00:00`)
    if (filter.to) q = q.lte('created_at', `${filter.to}T23:59:59.999`)
    return check(await q).map(mapSale)
  },
  async createSale(i) {
    const id = check(
      await supabase().rpc('process_sale', {
        p_store: i.store_id,
        p_items: i.items,
        p_discount: i.discount_amount,
        p_payments: i.payments,
        p_supervisor: i.supervisor_id ?? null,
      }),
    ) as string
    const row = check(await supabase().from('sales').select('*, sale_items(*), payments(*)').eq('id', id).single())
    return mapSale(row)
  },

  async listDailyReports() {
    const rows = check(
      await supabase()
        .from('daily_reports')
        .select('*, report_expenses(*)')
        .order('report_date', { ascending: false }),
    )
    return rows.map(mapReport)
  },
  async theoreticalAmount(storeId, date) {
    return num(check(await supabase().rpc('pos_theoretical_amount', { p_store: storeId, p_date: date })))
  },
  async saveDailyReport(i) {
    const id = check(
      await supabase().rpc('save_daily_report', {
        p_id: i.id ?? null,
        p_store: i.store_id,
        p_date: i.report_date,
        p_declared: i.declared_amount,
        p_notes: i.notes,
        p_expenses: i.expenses,
      }),
    ) as string
    return mapReport(check(await supabase().from('daily_reports').select('*, report_expenses(*)').eq('id', id).single()))
  },
  async submitDailyReport(id) {
    check(await supabase().rpc('submit_daily_report', { p_id: id }))
  },
  async validateDailyReport(id) {
    check(await supabase().rpc('review_daily_report', { p_id: id, p_approve: true }))
  },
  async rejectDailyReport(id, reason) {
    check(await supabase().rpc('review_daily_report', { p_id: id, p_approve: false, p_reason: reason }))
  },

  async listNotifications() {
    const me = await uid()
    const rows = check(
      await supabase()
        .from('notifications')
        .select('*, notification_reads(user_id)')
        .order('created_at', { ascending: false })
        .limit(100),
    )
    return rows.map(
      (n: Row): AppNotification => ({
        ...(n as AppNotification),
        read: (n.notification_reads ?? []).some((r: Row) => r.user_id === me),
      }),
    )
  },
  async markNotificationRead(id) {
    const me = await uid()
    await supabase().from('notification_reads').upsert({ notification_id: id, user_id: me })
  },
  async markAllNotificationsRead() {
    const me = await uid()
    const list = await this.listNotifications()
    const unread = list.filter((n) => !n.read).map((n) => ({ notification_id: n.id, user_id: me }))
    if (unread.length) await supabase().from('notification_reads').upsert(unread)
  },
  async listAuditLogs() {
    return check(await supabase().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500))
  },

  subscribe(onChange) {
    const ch = supabase()
      .channel('mmcg-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => onChange(payload.table))
      .subscribe()
    return () => {
      void supabase().removeChannel(ch)
    }
  },
}
