import { describe, expect, it } from 'vitest'
import { computeSaleTotals, computeVariance, discountFromInput, ean13, generateSku, isValidEan13, saleMargin } from '@/data/logic'
import { computeMargin } from '@/lib/utils'
import type { Product } from '@/types'

const p = (id: string, price: number, pa = 1000, vat = 18): Product => ({
  id, sku: id, barcode: null, name: id, brand: '', description: '', packaging: '', category_id: null, supplier_id: null,
  purchase_price: pa, selling_price: price, vat_rate: vat, min_stock_level: 5, image_url: null, is_active: true, created_at: '',
})

describe('computeSaleTotals', () => {
  const products = new Map([['a', p('a', 11800)], ['b', p('b', 5900)]])

  it('calcule sous-total, TVA incluse et total sans remise', () => {
    const t = computeSaleTotals([{ product_id: 'a', quantity: 2 }, { product_id: 'b', quantity: 1 }], products, 0)
    expect(t.subtotal).toBe(29500)
    expect(t.total).toBe(29500)
    expect(t.tax_amount).toBe(4500) // 29500 × 18/118
  })

  it('répartit la remise au prorata pour la TVA', () => {
    const t = computeSaleTotals([{ product_id: 'a', quantity: 1 }], products, 1180)
    expect(t.total).toBe(10620)
    expect(t.tax_amount).toBe(1620)
  })

  it('plafonne la remise au sous-total et ignore les quantités nulles', () => {
    const t = computeSaleTotals([{ product_id: 'a', quantity: 1 }, { product_id: 'b', quantity: 0 }], products, 999999)
    expect(t.items).toHaveLength(1)
    expect(t.total).toBe(0)
  })

  it('rejette un produit inconnu', () => {
    expect(() => computeSaleTotals([{ product_id: 'x', quantity: 1 }], products, 0)).toThrow()
  })
})

describe('remises', () => {
  it('convertit pourcentage et montant', () => {
    expect(discountFromInput(20000, 'percent', 10)).toBe(2000)
    expect(discountFromInput(20000, 'percent', 150)).toBe(20000)
    expect(discountFromInput(20000, 'amount', 25000)).toBe(20000)
    expect(discountFromInput(20000, 'amount', -5)).toBe(0)
  })
})

describe('écart de caisse', () => {
  it('compare déclaré + dépenses au théorique POS', () => {
    expect(computeVariance(100000, 94500, 5500)).toEqual({ variance: 0, variance_pct: 0 })
    expect(computeVariance(100000, 90000, 5500)).toEqual({ variance: -4500, variance_pct: -4.5 })
    expect(computeVariance(0, 1000, 0).variance_pct).toBe(0)
  })
})

describe('marges', () => {
  it('calcule marge HT et taux de marque', () => {
    const m = computeMargin(5000, 11800, 18)
    expect(m.sellingHT).toBeCloseTo(10000)
    expect(m.margin).toBeCloseTo(5000)
    expect(m.markupRate).toBeCloseTo(50)
  })
  it('tient compte de la remise dans la marge réalisée', () => {
    const items = [{ product_id: 'a', product_name: 'a', quantity: 1, unit_price: 11800, purchase_price: 5000, vat_rate: 18, line_total: 11800 }]
    expect(saleMargin(items, 0)).toBeCloseTo(5000)
    expect(saleMargin(items, 1180)).toBeCloseTo(4000)
  })
})

describe('codification', () => {
  it('génère un SKU séquentiel par catégorie', () => {
    expect(generateSku('par', ['COSM-PAR-0041', 'COSM-PAR-0007', 'COSM-SOI-0099'])).toBe('COSM-PAR-0042')
    expect(generateSku('MAQ', [])).toBe('COSM-MAQ-0001')
  })
  it('calcule et valide la clé EAN13', () => {
    expect(ean13('400638133393')).toBe('4006381333931')
    expect(isValidEan13('4006381333931')).toBe(true)
    expect(isValidEan13('4006381333932')).toBe(false)
  })
})
