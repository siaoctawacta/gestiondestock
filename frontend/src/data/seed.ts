import type {
  AppNotification,
  AuditLog,
  Category,
  DailyReport,
  InventoryItem,
  Payment,
  Product,
  Profile,
  Sale,
  StockMovement,
  Store,
  Supplier,
  Transfer,
} from '@/types'
import { computeSaleTotals, computeVariance, ean13 } from './logic'

export interface DemoDb {
  version: number
  users: (Profile & { password: string })[]
  stores: Store[]
  categories: Category[]
  suppliers: Supplier[]
  products: Product[]
  inventory: InventoryItem[]
  movements: StockMovement[]
  transfers: Transfer[]
  sales: Sale[]
  daily_reports: DailyReport[]
  notifications: AppNotification[]
  audit_logs: AuditLog[]
}

export const DEMO_PASSWORD = 'demo1234'
export const DB_VERSION = 6

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const id = (prefix: string, n: number) =>
  `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`

export function buildSeed(): DemoDb {
  const r = rng(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const now = new Date()
  const iso = (d: Date) => d.toISOString()
  const daysAgo = (n: number, h = 10, m = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    d.setHours(h, m, 0, 0)
    return d
  }

  /* ---------- Boutiques ---------- */
  // Les deux boutiques MM Cosmétiques, à Lomé (Togo) — coordonnées fournies par MM Cosmétiques.
  const storeDefs = [
    ['AGB', 'MM Cosmétiques Agbalépédo', 'Agbalépédo', 'Grand Lomé'],
    ['CAC', 'MM Cosmétiques Cacaveli', 'Cacaveli', 'Grand Lomé'],
  ]
  const stores: Store[] = storeDefs.map(([code, name, address, region], i) => ({
    id: id('5707e', i + 1),
    code: `BTQ-${code}`,
    name,
    address,
    region,
    phone: '(+228) 93 65 53 41',
    email: 'contact@mmcosmetiques.com',
    manager_id: null,
    is_active: true,
    created_at: iso(daysAgo(400)),
  }))
  const S = stores.map((s) => s.id)

  /* ---------- Utilisateurs ---------- */
  const u = (
    n: number,
    first: string,
    last: string,
    email: string,
    role: Profile['role'],
    store_id: string | null,
    store_ids: string[] = [],
  ) => ({
    id: id('05e7', n),
    first_name: first,
    last_name: last,
    email,
    phone: `+228 90 ${String(10 + n).padStart(2, '0')} ${String(40 + n).padStart(2, '0')} 11`,
    role,
    store_id,
    store_ids,
    is_active: true,
    last_login_at: iso(daysAgo(n % 4, 8 + (n % 3), 12)),
    created_at: iso(daysAgo(380 - n)),
    password: DEMO_PASSWORD,
  })
  const users = [
    u(1, 'Afi', 'Mensah', 'admin@mmcg.tg', 'super_admin', null),
    u(2, 'Kossi', 'Agbéko', 'admin.boutique@mmcg.tg', 'store_admin', S[0], [S[0], S[1]]),
    u(3, 'Akouvi', 'Amegah', 'resp.agbalepedo@mmcg.tg', 'store_manager', S[0]),
    u(4, 'Edem', 'Kpodar', 'resp.cacaveli@mmcg.tg', 'store_manager', S[1]),
    u(5, 'Sena', 'Lawson', 'pole@mmcg.tg', 'pole_chief', S[0], [S[0], S[1]]),
    u(6, 'Abla', 'Dossou', 'caisse.agbalepedo@mmcg.tg', 'cashier', S[0]),
    u(7, 'Kokou', 'Adjovi', 'caisse.cacaveli@mmcg.tg', 'cashier', S[1]),
    u(8, 'Yao', 'Gbédji', 'stock@mmcg.tg', 'stock_manager', null),
  ]
  const [superAdmin, storeAdmin, respAgb, respCac, poleChief, , , stockManager] = users
  stores[0].manager_id = respAgb.id
  stores[1].manager_id = respCac.id
  const cashierOf: Record<string, string> = {
    [S[0]]: users[5].id,
    [S[1]]: users[6].id,
  }

  /* ---------- Catégories & fournisseurs ---------- */
  const catDefs = [
    ['Soin visage', 'SOI'],
    ['Maquillage', 'MAQ'],
    ['Parfum', 'PAR'],
    ['Soin corps', 'COR'],
    ['Cheveux', 'CHE'],
    ['Hygiène', 'HYG'],
    ['Accessoires', 'ACC'],
  ]
  const categories: Category[] = catDefs.map(([name, code], i) => ({
    id: id('ca7e', i + 1),
    name,
    code,
    parent_id: null,
  }))
  const supDefs = [
    ['Beauté Import SARL', 'Kader Touré'],
    ['L’Atelier Parfums', 'Nadia Sylla'],
    ['Afro Naturals', 'Paul Ehui'],
    ['Distrib Cosmétiques Togo', 'Rokia Amouzou'],
  ]
  const suppliers: Supplier[] = supDefs.map(([name, contact], i) => ({
    id: id('50991', i + 1),
    name,
    contact_name: contact,
    phone: `+228 22 2${i} 4${i} 60`,
    email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.tg`,
    address: 'Zone portuaire, Lomé',
  }))

  /* ---------- Produits ---------- */
  type P = [string, string, number, string, number, number]
  // [nom, marque, catIndex, conditionnement, prix achat HT, prix vente TTC]
  const productDefs: P[] = [
    ['Sérum Éclat Vitamine C', 'Lumière', 0, 'Flacon 30 ml', 7800, 15500],
    ['Crème Hydratante Karité', 'Afro Naturals', 0, 'Pot 50 ml', 4200, 8500],
    ['Gel Nettoyant Purifiant', 'Dermacare', 0, 'Tube 150 ml', 3100, 6500],
    ['Masque Argile Détox', 'Lumière', 0, 'Pot 75 ml', 3900, 7900],
    ['Contour des Yeux Anti-cernes', 'Dermacare', 0, 'Tube 15 ml', 6100, 12500],
    ['Eau Micellaire Douceur', 'Dermacare', 0, 'Flacon 400 ml', 3600, 7200],
    ['Fond de Teint Mat 24h', 'Ébène Studio', 1, 'Flacon 30 ml', 6500, 13500],
    ['Rouge à Lèvres Velours', 'Ébène Studio', 1, 'Stick 3,5 g', 2700, 5900],
    ['Mascara Volume Intense', 'Glamour', 1, 'Tube 10 ml', 3200, 6900],
    ['Palette Ombres Sahara', 'Glamour', 1, 'Palette 12 teintes', 7400, 15900],
    ['Poudre Libre Fixatrice', 'Ébène Studio', 1, 'Boîte 20 g', 4100, 8900],
    ['Eyeliner Feutre Noir', 'Glamour', 1, 'Feutre 1 ml', 2200, 4900],
    ['Eau de Parfum Oud Royal', 'Maison Lomé', 2, 'Flacon 100 ml', 18500, 39000],
    ['Eau de Parfum Fleur d’Ylang', 'Maison Lomé', 2, 'Flacon 50 ml', 12800, 27500],
    ['Eau de Toilette Vétiver', 'L’Atelier', 2, 'Flacon 100 ml', 11200, 23900],
    ['Brume Parfumée Coco', 'L’Atelier', 2, 'Spray 250 ml', 3900, 8500],
    ['Huile Sèche Pailletée', 'Lumière', 3, 'Flacon 100 ml', 5400, 11500],
    ['Beurre de Karité Pur', 'Afro Naturals', 3, 'Pot 200 g', 2300, 4900],
    ['Lait Corporel Unifiant', 'Dermacare', 3, 'Flacon 400 ml', 4400, 9200],
    ['Gommage Sucre & Coco', 'Afro Naturals', 3, 'Pot 250 g', 3300, 6900],
    ['Shampoing Ricin Fortifiant', 'Afro Naturals', 4, 'Flacon 300 ml', 2900, 5900],
    ['Masque Capillaire Avocat', 'Afro Naturals', 4, 'Pot 500 ml', 4600, 9500],
    ['Huile Capillaire Chébé', 'Sahel Secrets', 4, 'Flacon 100 ml', 5200, 10900],
    ['Crème Coiffante Boucles', 'Sahel Secrets', 4, 'Pot 250 ml', 3700, 7800],
    ['Savon Noir Africain', 'Sahel Secrets', 5, 'Pain 150 g', 900, 2000],
    ['Déodorant Roll-on Fraîcheur', 'Dermacare', 5, 'Roll-on 50 ml', 1400, 3000],
    ['Gel Douche Hibiscus', 'Lumière', 5, 'Flacon 500 ml', 2100, 4500],
    ['Pinceaux Maquillage (x8)', 'Glamour', 6, 'Kit 8 pièces', 6200, 13900],
    ['Éponge Blender Teint', 'Glamour', 6, 'Unité', 1100, 2500],
    ['Trousse Beauté Wax', 'MM Cosmétiques', 6, 'Unité', 3500, 7500],
  ]
  const products: Product[] = productDefs.map(([name, brand, ci, pack, pa, pv], i) => {
    const cat = categories[ci]
    const n = String(i + 1).padStart(4, '0')
    return {
      id: id('9d0c', i + 1),
      sku: `COSM-${cat.code}-${n}`,
      barcode: ean13(`61900${String(100000 + i * 37).slice(0, 7)}`),
      name,
      brand,
      description: `${name} — ${brand}. Formule pensée pour les peaux et cheveux d’Afrique de l’Ouest.`,
      packaging: pack,
      category_id: cat.id,
      supplier_id: suppliers[i % suppliers.length].id,
      purchase_price: pa,
      selling_price: pv,
      vat_rate: 18,
      min_stock_level: pv > 20000 ? 3 : 6,
      image_url: null,
      is_active: true,
      created_at: iso(daysAgo(360 - i)),
    }
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  /* ---------- Stock initial ---------- */
  const inventory: InventoryItem[] = []
  const movements: StockMovement[] = []
  let mv = 0
  const qty: Record<string, number> = {}
  const key = (s: string, p: string) => `${s}|${p}`
  stores.forEach((s) => {
    products.forEach((p, pi) => {
      const base = 30 + Math.floor(r() * 50)
      qty[key(s.id, p.id)] = base + 70 // stock avant historique de ventes
      movements.push({
        id: id('70e3', ++mv),
        product_id: p.id,
        store_id: s.id,
        user_id: stockManager.id,
        type: 'entry',
        quantity: base + 70,
        reason: 'Stock initial',
        lot_number: `LOT-${2026}${String(pi + 1).padStart(3, '0')}`,
        expiry_date: iso(daysAgo(-400 - Math.floor(r() * 300))).slice(0, 10),
        reference: 'BR-INIT',
        created_at: iso(daysAgo(62, 8)),
      })
    })
  })

  /* ---------- Historique des ventes (60 jours) ---------- */
  const sales: Sale[] = []
  let saleN = 0
  const methods: Payment['method'][] = ['cash', 'cash', 'cash', 'mobile_money', 'mobile_money', 'card']
  const providers = ['wave', 'orange_money', 'mtn'] as const
  const popular = products.map((_, i) => (i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1))
  const weighted = products.flatMap((p, i) => Array(popular[i]).fill(p.id) as string[])

  for (let d = 59; d >= 0; d--) {
    stores.forEach((s, si) => {
      const weekend = [0, 6].includes(daysAgo(d).getDay())
      const count = Math.floor((weekend ? 9 : 6) * (si === 0 ? 2.2 : 1.8) + r() * 5)
      for (let k = 0; k < count; k++) {
        const nLines = 1 + Math.floor(r() * 3)
        const lines = new Map<string, number>()
        for (let l = 0; l < nLines; l++) {
          const pid = pick(weighted)
          if ((qty[key(s.id, pid)] ?? 0) - (lines.get(pid) ?? 0) > 1)
            lines.set(pid, (lines.get(pid) ?? 0) + 1 + (r() > 0.85 ? 1 : 0))
        }
        if (!lines.size) continue
        const cart = [...lines].map(([product_id, quantity]) => ({ product_id, quantity }))
        const discountPct = r() > 0.9 ? 10 : r() > 0.95 ? 5 : 0
        const pre = computeSaleTotals(cart, productMap, 0)
        const t = computeSaleTotals(cart, productMap, (pre.subtotal * discountPct) / 100)
        const method = pick(methods)
        const received = method === 'cash' ? Math.ceil(t.total / 5000) * 5000 : null
        const created = daysAgo(d, 9 + Math.floor(r() * 10), Math.floor(r() * 60))
        if (d === 0 && created > now) created.setTime(now.getTime() - (count - k) * 600000)
        saleN++
        const sale: Sale = {
          id: id('5a1e', saleN),
          reference: `TK-${s.code.slice(4)}-${String(saleN).padStart(6, '0')}`,
          store_id: s.id,
          cashier_id: cashierOf[s.id],
          subtotal: t.subtotal,
          discount_amount: t.discount_amount,
          tax_amount: t.tax_amount,
          total: t.total,
          status: 'completed',
          created_at: iso(created),
          items: t.items,
          payments: [
            {
              method,
              provider: method === 'mobile_money' ? pick([...providers]) : null,
              amount: t.total,
              amount_received: received,
              change_given: received !== null ? received - t.total : null,
            },
          ],
        }
        sales.push(sale)
        t.items.forEach((it) => {
          qty[key(s.id, it.product_id)] -= it.quantity
          movements.push({
            id: id('70e3', ++mv),
            product_id: it.product_id,
            store_id: s.id,
            user_id: sale.cashier_id,
            type: 'sale',
            quantity: -it.quantity,
            reason: null,
            lot_number: null,
            expiry_date: null,
            reference: sale.reference,
            created_at: sale.created_at,
          })
        })
      }
    })
  }
  sales.sort((a, b) => b.created_at.localeCompare(a.created_at))

  // Quelques ruptures / stocks faibles réalistes
  const lowSet: [number, number, number][] = [
    [0, 12, 2],
    [0, 7, 0],
    [1, 0, 4],
    [1, 9, 1],
    [1, 13, 0],
    [0, 22, 3],
  ]
  lowSet.forEach(([si, pi, q]) => {
    const k = key(S[si], products[pi].id)
    const delta = q - qty[k]
    qty[k] = q
    movements.push({
      id: id('70e3', ++mv),
      product_id: products[pi].id,
      store_id: S[si],
      user_id: respAgb.id,
      type: 'adjustment',
      quantity: delta,
      reason: 'Inventaire tournant',
      lot_number: null,
      expiry_date: null,
      reference: 'INV-CYCLE',
      created_at: iso(daysAgo(1, 18)),
    })
  })

  stores.forEach((s) =>
    products.forEach((p, i) =>
      inventory.push({
        id: id('1e7e', inventory.length + 1),
        store_id: s.id,
        product_id: p.id,
        quantity: Math.max(0, qty[key(s.id, p.id)]),
        min_stock_level: null,
        updated_at: iso(daysAgo(i % 3)),
      }),
    ),
  )
  movements.sort((a, b) => b.created_at.localeCompare(a.created_at))

  /* ---------- Transferts ---------- */
  const transfers: Transfer[] = [
    {
      id: id('7a5f', 1),
      reference: 'TRF-000001',
      source_store_id: S[0],
      dest_store_id: S[1],
      status: 'in_transit',
      notes: 'Réassort parfums pour le week-end',
      created_by: stockManager.id,
      received_by: null,
      created_at: iso(daysAgo(1, 15)),
      received_at: null,
      items: [
        { product_id: products[12].id, quantity: 6 },
        { product_id: products[13].id, quantity: 4 },
      ],
    },
    {
      id: id('7a5f', 2),
      reference: 'TRF-000002',
      source_store_id: S[1],
      dest_store_id: S[0],
      status: 'in_transit',
      notes: null,
      created_by: storeAdmin.id,
      received_by: null,
      created_at: iso(daysAgo(0, 9)),
      received_at: null,
      items: [{ product_id: products[0].id, quantity: 10 }],
    },
    {
      id: id('7a5f', 3),
      reference: 'TRF-000003',
      source_store_id: S[0],
      dest_store_id: S[1],
      status: 'received',
      notes: 'Maquillage — opération fête des mères',
      created_by: stockManager.id,
      received_by: respCac.id,
      created_at: iso(daysAgo(6, 10)),
      received_at: iso(daysAgo(5, 11)),
      items: [
        { product_id: products[6].id, quantity: 8 },
        { product_id: products[7].id, quantity: 15 },
      ],
    },
  ]

  /* ---------- Déclarations journalières ---------- */
  const daily_reports: DailyReport[] = []
  const dayTotal = (storeId: string, d: number) => {
    const day = daysAgo(d).toISOString().slice(0, 10)
    return sales
      .filter((s) => s.store_id === storeId && s.created_at.slice(0, 10) === day)
      .reduce((a, s) => a + s.total, 0)
  }
  let dr = 0
  const mkReport = (storeId: string, userId: string, d: number, status: DailyReport['status'], gap: number) => {
    const theoretical = dayTotal(storeId, d)
    const expenses = [
      { id: id('e8e5', ++dr * 10), label: 'Transport livraison', category: 'Transport', amount: 3000 },
      { id: id('e8e5', dr * 10 + 1), label: 'Sachets & fournitures', category: 'Fournitures', amount: 2500 },
    ]
    const expTotal = expenses.reduce((a, e) => a + e.amount, 0)
    const declared = theoretical - expTotal + gap
    const v = computeVariance(theoretical, declared, expTotal)
    daily_reports.push({
      id: id('d4e9', dr),
      store_id: storeId,
      user_id: userId,
      report_date: daysAgo(d).toISOString().slice(0, 10),
      theoretical_amount: theoretical,
      declared_amount: declared,
      expenses_total: expTotal,
      variance: v.variance,
      variance_pct: v.variance_pct,
      status,
      notes: gap < 0 ? 'Écart constaté au comptage du coffre.' : null,
      rejection_reason: status === 'rejected' ? 'Justificatif de transport manquant.' : null,
      validated_by: status === 'validated' || status === 'rejected' ? superAdmin.id : null,
      validated_at: status === 'validated' || status === 'rejected' ? iso(daysAgo(d - 1, 9)) : null,
      created_at: iso(daysAgo(d, 20)),
      expenses,
    })
  }
  for (let d = 6; d >= 1; d--) {
    mkReport(S[1], poleChief.id, d, d > 2 ? 'validated' : d === 2 ? 'rejected' : 'submitted', d === 1 ? -9500 : 0)
    mkReport(S[0], poleChief.id, d, d > 1 ? 'validated' : 'draft', d === 3 ? -2000 : 0)
  }

  /* ---------- Notifications ---------- */
  let nn = 0
  const notif = (
    type: AppNotification['type'],
    severity: AppNotification['severity'],
    title: string,
    message: string,
    store_id: string | null,
    target_roles: AppNotification['target_roles'],
    hoursAgo: number,
    read = false,
  ): AppNotification => ({
    id: id('a0e1', ++nn),
    user_id: null,
    store_id,
    target_roles,
    type,
    title,
    message,
    severity,
    read,
    created_at: new Date(now.getTime() - hoursAgo * 3600000).toISOString(),
  })
  const stockRoles: AppNotification['target_roles'] = ['super_admin', 'store_admin', 'store_manager', 'stock_manager']
  const notifications: AppNotification[] = [
    notif('out_of_stock', 'critical', 'Rupture de stock', `${products[7].name} est épuisé à ${stores[0].name}.`, S[0], stockRoles, 2),
    notif('out_of_stock', 'critical', 'Rupture de stock', `${products[13].name} est épuisé à ${stores[1].name}.`, S[1], stockRoles, 5),
    notif('low_stock', 'warning', 'Stock faible', `${products[12].name} : 2 unités restantes à ${stores[0].name}.`, S[0], stockRoles, 6),
    notif('low_stock', 'warning', 'Stock faible', `${products[0].name} : 4 unités restantes à ${stores[1].name}.`, S[1], stockRoles, 9),
    notif('daily_report', 'info', 'Nouvelle déclaration', `${poleChief.first_name} ${poleChief.last_name} a soumis la déclaration de ${stores[1].name}.`, S[1], ['super_admin', 'store_admin'], 14),
    notif('cash_variance', 'critical', 'Écart de caisse', `Écart de −9 500 XOF détecté sur la déclaration de ${stores[1].name}.`, S[1], ['super_admin', 'store_admin'], 14),
    notif('transfer', 'info', 'Transfert en transit', `TRF-000002 : ${stores[1].name} → ${stores[0].name}.`, S[0], ['super_admin', 'store_admin', 'store_manager', 'stock_manager'], 3),
    notif('transfer', 'info', 'Transfert en transit', `TRF-000001 : ${stores[0].name} → ${stores[1].name}.`, S[1], ['super_admin', 'store_admin', 'store_manager', 'stock_manager'], 20, true),
  ]

  const audit_logs: AuditLog[] = [
    { id: id('a0d1', 1), user_id: superAdmin.id, action: 'UPDATE', entity: 'products', entity_id: products[12].id, details: 'Prix de vente : 37 500 → 39 000', created_at: iso(daysAgo(3, 11)) },
    { id: id('a0d1', 2), user_id: superAdmin.id, action: 'INSERT', entity: 'stores', entity_id: S[1], details: `Création de la boutique ${stores[1].name}`, created_at: iso(daysAgo(120, 9)) },
    { id: id('a0d1', 3), user_id: respAgb.id, action: 'ADJUST', entity: 'inventory', entity_id: null, details: 'Inventaire tournant — 6 références ajustées', created_at: iso(daysAgo(1, 18)) },
    { id: id('a0d1', 4), user_id: superAdmin.id, action: 'VALIDATE', entity: 'daily_reports', entity_id: daily_reports[0].id, details: 'Déclaration validée', created_at: iso(daysAgo(5, 9)) },
    { id: id('a0d1', 5), user_id: superAdmin.id, action: 'REJECT', entity: 'daily_reports', entity_id: null, details: 'Justificatif de transport manquant.', created_at: iso(daysAgo(1, 9)) },
    { id: id('a0d1', 6), user_id: superAdmin.id, action: 'UPDATE', entity: 'users', entity_id: users[6].id, details: `Réaffectation à ${stores[1].name}`, created_at: iso(daysAgo(10, 15)) },
  ]

  return {
    version: DB_VERSION,
    users,
    stores,
    categories,
    suppliers,
    products,
    inventory,
    movements,
    transfers,
    sales,
    daily_reports,
    notifications,
    audit_logs,
  }
}
