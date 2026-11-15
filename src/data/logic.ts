import type { CartLine, Product, SaleItem } from '@/types'

export interface SaleTotals {
  items: SaleItem[]
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
}

/**
 * Calcule les totaux d'une vente. Les prix de vente sont TTC.
 * La remise est répartie au prorata sur les lignes pour calculer la TVA exacte.
 */
export function computeSaleTotals(
  lines: CartLine[],
  products: Map<string, Product> | Record<string, Product>,
  discountAmount: number,
): SaleTotals {
  const get = (id: string) =>
    products instanceof Map ? products.get(id) : (products as Record<string, Product>)[id]

  const items: SaleItem[] = lines
    .filter((l) => l.quantity > 0)
    .map((l) => {
      const p = get(l.product_id)
      if (!p) throw new Error(`Produit introuvable : ${l.product_id}`)
      return {
        product_id: p.id,
        product_name: p.name,
        quantity: l.quantity,
        unit_price: p.selling_price,
        purchase_price: p.purchase_price,
        vat_rate: p.vat_rate,
        line_total: p.selling_price * l.quantity,
      }
    })

  const subtotal = items.reduce((a, i) => a + i.line_total, 0)
  const discount = Math.min(Math.max(0, Math.round(discountAmount)), subtotal)
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0
  const tax = items.reduce((a, i) => {
    const net = i.line_total * ratio
    return a + (net * i.vat_rate) / (100 + i.vat_rate)
  }, 0)

  return {
    items,
    subtotal,
    discount_amount: discount,
    tax_amount: Math.round(tax),
    total: subtotal - discount,
  }
}

export function discountFromInput(subtotal: number, mode: 'percent' | 'amount', value: number) {
  if (!value || value < 0) return 0
  if (mode === 'percent') return Math.round((subtotal * Math.min(value, 100)) / 100)
  return Math.min(Math.round(value), subtotal)
}

export function discountPercent(subtotal: number, discount: number) {
  return subtotal > 0 ? (discount / subtotal) * 100 : 0
}

/** Écart de caisse : montant déclaré + dépenses justifiées − montant théorique POS. */
export function computeVariance(theoretical: number, declared: number, expensesTotal: number) {
  const variance = declared + expensesTotal - theoretical
  const pct = theoretical > 0 ? (variance / theoretical) * 100 : 0
  return { variance, variance_pct: Math.round(pct * 100) / 100 }
}

/** Marge réalisée sur une ligne de vente (HT, remise incluse au prorata). */
export function saleMargin(items: SaleItem[], discount: number) {
  const subtotal = items.reduce((a, i) => a + i.line_total, 0)
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0
  return items.reduce((a, i) => {
    const netTTC = i.line_total * ratio
    const netHT = netTTC / (1 + i.vat_rate / 100)
    return a + netHT - i.purchase_price * i.quantity
  }, 0)
}

export function generateSku(categoryCode: string, existing: string[]) {
  const prefix = `COSM-${(categoryCode || 'GEN').toUpperCase().slice(0, 3)}-`
  const max = existing
    .filter((s) => s.startsWith(prefix))
    .map((s) => parseInt(s.slice(prefix.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** Calcule un EAN-13 valide à partir de 12 chiffres. */
export function ean13(base12: string) {
  const digits = base12.replace(/\D/g, '').padStart(12, '0').slice(0, 12)
  const sum = digits.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return digits + ((10 - (sum % 10)) % 10)
}

export function isValidEan13(code: string) {
  return /^\d{13}$/.test(code) && ean13(code.slice(0, 12)) === code
}
