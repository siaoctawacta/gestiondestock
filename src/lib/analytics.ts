import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Category, InventoryItem, Product, Sale, Store } from '@/types'
import { saleMargin } from '@/data/logic'

export const localDay = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')

export function inRange(sales: Sale[], from: Date, to: Date) {
  const f = format(from, 'yyyy-MM-dd')
  const t = format(to, 'yyyy-MM-dd')
  return sales.filter((s) => {
    const d = localDay(s.created_at)
    return d >= f && d <= t && s.status === 'completed'
  })
}

export function summarize(sales: Sale[]) {
  const revenue = sales.reduce((a, s) => a + s.total, 0)
  const tax = sales.reduce((a, s) => a + s.tax_amount, 0)
  const discounts = sales.reduce((a, s) => a + s.discount_amount, 0)
  const margin = sales.reduce((a, s) => a + saleMargin(s.items, s.discount_amount), 0)
  const units = sales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.quantity, 0), 0)
  const count = sales.length
  return {
    revenue,
    revenueHT: revenue - tax,
    tax,
    discounts,
    margin,
    marginRate: revenue - tax > 0 ? (margin / (revenue - tax)) * 100 : 0,
    count,
    units,
    basket: count ? revenue / count : 0,
  }
}

export function delta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0
  return ((current - previous) / previous) * 100
}

/** Série journalière CA / marge / transactions. */
export function dailySeries(sales: Sale[], days: number, end = new Date()) {
  const start = subDays(end, days - 1)
  const byDay = new Map<string, { revenue: number; margin: number; count: number }>()
  for (const s of sales) {
    if (s.status !== 'completed') continue
    const d = localDay(s.created_at)
    const cur = byDay.get(d) ?? { revenue: 0, margin: 0, count: 0 }
    cur.revenue += s.total
    cur.margin += saleMargin(s.items, s.discount_amount)
    cur.count += 1
    byDay.set(d, cur)
  }
  return eachDayOfInterval({ start, end }).map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    const v = byDay.get(key) ?? { revenue: 0, margin: 0, count: 0 }
    return {
      date: key,
      label: format(d, days > 31 ? 'dd/MM' : 'dd MMM', { locale: fr }),
      revenue: Math.round(v.revenue),
      margin: Math.round(v.margin),
      count: v.count,
    }
  })
}

/** Ventes par heure (0-23). */
export function hourlySeries(sales: Sale[]) {
  const hours = Array.from({ length: 13 }, (_, i) => ({ hour: `${i + 8}h`, revenue: 0, count: 0 }))
  sales.forEach((s) => {
    const h = parseISO(s.created_at).getHours() - 8
    if (h >= 0 && h < hours.length) {
      hours[h].revenue += s.total
      hours[h].count += 1
    }
  })
  return hours
}

export function topProducts(sales: Sale[], limit = 10) {
  const map = new Map<string, { product_id: string; name: string; quantity: number; revenue: number; margin: number }>()
  for (const s of sales) {
    const ratio = s.subtotal > 0 ? (s.subtotal - s.discount_amount) / s.subtotal : 0
    for (const i of s.items) {
      const cur = map.get(i.product_id) ?? { product_id: i.product_id, name: i.product_name, quantity: 0, revenue: 0, margin: 0 }
      const net = i.line_total * ratio
      cur.quantity += i.quantity
      cur.revenue += net
      cur.margin += net / (1 + i.vat_rate / 100) - i.purchase_price * i.quantity
      map.set(i.product_id, cur)
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export function storeRanking(sales: Sale[], stores: Store[]) {
  return stores
    .map((st) => {
      const list = sales.filter((s) => s.store_id === st.id)
      return { store: st, ...summarize(list) }
    })
    // Une boutique supprimée n'apparaît que si elle a encore des ventes sur la période
    .filter((r) => !r.store.deleted_at || r.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
}

export function byCategory(sales: Sale[], products: Map<string, Product>, categories: Category[]) {
  const totals = new Map<string, number>()
  for (const s of sales) {
    const ratio = s.subtotal > 0 ? (s.subtotal - s.discount_amount) / s.subtotal : 0
    for (const i of s.items) {
      const cat = products.get(i.product_id)?.category_id ?? 'none'
      totals.set(cat, (totals.get(cat) ?? 0) + i.line_total * ratio)
    }
  }
  return categories
    .map((c) => ({ id: c.id, name: c.name, value: Math.round(totals.get(c.id) ?? 0) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function byPaymentMethod(sales: Sale[]) {
  const totals = { cash: 0, mobile_money: 0, card: 0 }
  sales.forEach((s) => s.payments.forEach((p) => (totals[p.method] += p.amount)))
  return [
    { key: 'cash', name: 'Espèces', value: totals.cash },
    { key: 'mobile_money', name: 'Mobile Money', value: totals.mobile_money },
    { key: 'card', name: 'Carte', value: totals.card },
  ]
}

export function byCashier(sales: Sale[]) {
  const map = new Map<string, { cashier_id: string; revenue: number; count: number; units: number; discounts: number }>()
  for (const s of sales) {
    const cur = map.get(s.cashier_id) ?? { cashier_id: s.cashier_id, revenue: 0, count: 0, units: 0, discounts: 0 }
    cur.revenue += s.total
    cur.count += 1
    cur.units += s.items.reduce((a, i) => a + i.quantity, 0)
    cur.discounts += s.discount_amount
    map.set(s.cashier_id, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export function effectiveMin(inv: InventoryItem, product: Product | undefined) {
  return inv.min_stock_level ?? product?.min_stock_level ?? 5
}

export function stockStats(inventory: InventoryItem[], products: Map<string, Product>) {
  let valueHT = 0
  let retailValue = 0
  let units = 0
  let low = 0
  let out = 0
  for (const i of inventory) {
    const p = products.get(i.product_id)
    if (!p || !p.is_active) continue
    valueHT += i.quantity * p.purchase_price
    retailValue += i.quantity * p.selling_price
    units += i.quantity
    if (i.quantity <= 0) out++
    else if (i.quantity <= effectiveMin(i, p)) low++
  }
  return { valueHT, retailValue, units, low, out }
}

/** Rotation : unités vendues sur la période / stock moyen (approx. stock actuel). */
export function stockRotation(sales: Sale[], inventory: InventoryItem[], products: Map<string, Product>, days: number) {
  const sold = new Map<string, number>()
  sales.forEach((s) => s.items.forEach((i) => sold.set(i.product_id, (sold.get(i.product_id) ?? 0) + i.quantity)))
  const stock = new Map<string, number>()
  inventory.forEach((i) => stock.set(i.product_id, (stock.get(i.product_id) ?? 0) + i.quantity))
  return [...products.values()]
    .map((p) => {
      const q = sold.get(p.id) ?? 0
      const st = stock.get(p.id) ?? 0
      const rotation = st > 0 ? q / st : q > 0 ? Infinity : 0
      const coverDays = q > 0 ? Math.round((st / q) * days) : null
      return { product: p, sold: q, stock: st, rotation, coverDays, value: st * p.purchase_price }
    })
    .sort((a, b) => b.sold - a.sold)
}
