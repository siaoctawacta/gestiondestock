// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { demoApi, resetDemoData } from '@/data/demoApi'
import { DEMO_PASSWORD } from '@/data/seed'

const login = (email: string) => demoApi.signIn(email, DEMO_PASSWORD)

describe('Étanchéité multi-boutiques (RLS émulée)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('un caissier ne voit que ses propres ventes, dans sa boutique', async () => {
    const me = await login('caisse.plateau@mmcg.ci')
    const sales = await demoApi.listSales()
    expect(sales.length).toBeGreaterThan(0)
    expect(sales.every((s) => s.store_id === me.store_id && s.cashier_id === me.id)).toBe(true)
  })

  it('un responsable de la boutique A ne lit pas les stocks de la boutique B', async () => {
    const me = await login('resp.plateau@mmcg.ci')
    const inv = await demoApi.listInventory()
    expect(inv.every((i) => i.store_id === me.store_id)).toBe(true)
  })

  it('un caissier ne peut pas encaisser pour une autre boutique', async () => {
    await login('caisse.plateau@mmcg.ci')
    const stores = await demoApi.listStores()
    const other = stores.find((s) => s.code === 'BTQ-COC')!
    const products = await demoApi.listProducts()
    await expect(
      demoApi.createSale({ store_id: other.id, items: [{ product_id: products[0].id, quantity: 1 }], discount_amount: 0, payments: [{ method: 'card', provider: null, amount: products[0].selling_price, amount_received: null, change_given: null }] }),
    ).rejects.toThrow(/périmètre/)
  })

  it('le super admin a une vue réseau complète', async () => {
    await login('admin@mmcg.ci')
    const inv = await demoApi.listInventory()
    expect(new Set(inv.map((i) => i.store_id)).size).toBe(5)
  })

  it('une remise > 15 % par un caissier exige un superviseur', async () => {
    const me = await login('caisse.plateau@mmcg.ci')
    const products = await demoApi.listProducts()
    const p = products[1]
    const discount = Math.round(p.selling_price * 0.2)
    const pay = [{ method: 'cash' as const, provider: null, amount: p.selling_price - discount, amount_received: p.selling_price, change_given: discount }]
    const input = { store_id: me.store_id!, items: [{ product_id: p.id, quantity: 1 }], discount_amount: discount, payments: pay }
    await expect(demoApi.createSale(input)).rejects.toThrow(/superviseur/)
    const sup = await demoApi.verifySupervisor('resp.plateau@mmcg.ci', DEMO_PASSWORD)
    const sale = await demoApi.createSale({ ...input, supervisor_id: sup.id })
    expect(sale.total).toBe(p.selling_price - discount)
  })

  it('une vente décrémente le stock et trace un mouvement', async () => {
    const me = await login('caisse.plateau@mmcg.ci')
    const products = await demoApi.listProducts()
    const p = products[2]
    const before = (await demoApi.listInventory()).find((i) => i.product_id === p.id)!.quantity
    await demoApi.createSale({ store_id: me.store_id!, items: [{ product_id: p.id, quantity: 2 }], discount_amount: 0, payments: [{ method: 'card', provider: null, amount: p.selling_price * 2, amount_received: null, change_given: null }] })
    const after = (await demoApi.listInventory()).find((i) => i.product_id === p.id)!.quantity
    expect(after).toBe(before - 2)
    await login('stock@mmcg.ci')
    const mv = await demoApi.listMovements(5)
    expect(mv[0]).toMatchObject({ type: 'sale', quantity: -2, product_id: p.id })
  })

  it('un transfert est atomique : débit source et crédit destination à la réception', async () => {
    await login('stock@mmcg.ci')
    const stores = await demoApi.listStores()
    const [a, b] = stores
    const products = await demoApi.listProducts()
    const p = products[3]
    const q = async (s: string) => (await demoApi.listInventory()).find((i) => i.store_id === s && i.product_id === p.id)!.quantity
    const [qa, qb] = [await q(a.id), await q(b.id)]
    const t = await demoApi.createTransfer({ source_store_id: a.id, dest_store_id: b.id, items: [{ product_id: p.id, quantity: 3 }], notes: null })
    expect(await q(a.id)).toBe(qa) // en transit : pas encore débité
    await demoApi.receiveTransfer(t.id)
    expect(await q(a.id)).toBe(qa - 3)
    expect(await q(b.id)).toBe(qb + 3)
  })

  it('le workflow de déclaration suit Brouillon → Envoyé → Rejeté/Validé', async () => {
    const chief = await login('pole.nord@mmcg.ci')
    const today = new Date().toISOString().slice(0, 10)
    const r = await demoApi.saveDailyReport({ store_id: chief.store_id!, report_date: today, declared_amount: 0, notes: null, expenses: [] })
    expect(r.status).toBe('draft')
    await demoApi.submitDailyReport(r.id)
    await login('admin@mmcg.ci')
    await expect(demoApi.rejectDailyReport(r.id, '')).rejects.toThrow()
    await demoApi.rejectDailyReport(r.id, 'Recompter le coffre')
    const list = await demoApi.listDailyReports()
    expect(list.find((x) => x.id === r.id)?.status).toBe('rejected')
  })
})
