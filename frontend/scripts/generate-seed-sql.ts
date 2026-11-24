/**
 * Génère, à partir des données démo (src/data/seed.ts), les données de départ des backends :
 *  - backend-supabase/supabase/seed.sql (Supabase)
 *  - backend/database/seeders/data/reference.json (Laravel)
 * Le mode démo et les bases de production partent ainsi des mêmes référentiels.
 * Usage : npm run seed:sql
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSeed } from '../src/data/seed'

const db = buildSeed()
const q = (v: unknown) =>
  v === null || v === undefined
    ? 'null'
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`
const rows = (items: unknown[][]) => items.map((r) => `  (${r.map(q).join(', ')})`).join(',\n') + ';\n'

const out = [
  '-- Données de référence MM Cosmétiques Stock Pro.',
  '-- Fichier généré par frontend/scripts/generate-seed-sql.ts (npm run seed:sql) : ne pas modifier à la main.',
  '-- Les comptes utilisateurs se créent via Supabase Auth (voir README).',
  '',
  'insert into public.categories (id, name, code) values',
  rows(db.categories.map((c) => [c.id, c.name, c.code])),
  'insert into public.suppliers (id, name, contact_name, phone, email, address) values',
  rows(db.suppliers.map((s) => [s.id, s.name, s.contact_name, s.phone, s.email, s.address])),
  'insert into public.stores (id, code, name, address, phone, email, region) values',
  rows(db.stores.map((s) => [s.id, s.code, s.name, s.address, s.phone, s.email, s.region])),
  'insert into public.products (id, sku, barcode, name, brand, description, packaging, category_id, supplier_id, purchase_price, selling_price, vat_rate, min_stock_level) values',
  rows(
    db.products.map((p) => [
      p.id, p.sku, p.barcode, p.name, p.brand, p.description, p.packaging, p.category_id, p.supplier_id,
      p.purchase_price, p.selling_price, p.vat_rate, p.min_stock_level,
    ]),
  ),
  '-- Stock initial : 50 unités par produit et par boutique',
  'update public.inventory set quantity = 50;',
  '',
].join('\n')

// npm run exécute le script depuis le dossier frontend/
const target = resolve(process.cwd(), '../backend-supabase/supabase/seed.sql')
writeFileSync(target, out)
console.log(`seed.sql écrit : ${target}`)

// Laravel : référentiels réels (boutiques, catégories) + catalogue de démonstration séparé
const reference = {
  stores: db.stores.map(({ id, code, name, address, phone, email, region }) => ({ id, code, name, address, phone, email, region })),
  categories: db.categories.map(({ id, name, code }) => ({ id, name, code })),
  demo: {
    suppliers: db.suppliers,
    products: db.products.map(({ created_at: _c, image_url: _i, ...p }) => p),
  },
}
const jsonTarget = resolve(process.cwd(), '../backend/database/seeders/data/reference.json')
writeFileSync(jsonTarget, JSON.stringify(reference, null, 2) + '\n')
console.log(`reference.json écrit : ${jsonTarget}`)
