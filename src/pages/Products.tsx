import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ImagePlus, Pencil, Plus, QrCode, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ProductThumb } from '@/components/common/ProductThumb'
import { ExportMenu } from '@/components/common/ExportMenu'
import { StockBadge } from '@/components/common/badges'
import { useAction, useCategories, useInventory, useLookups, useProducts, useSuppliers } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { can } from '@/lib/permissions'
import { ean13, generateSku, isValidEan13 } from '@/data/logic'
import { computeMargin, formatMoney, formatPct } from '@/lib/utils'
import { exportExcel, exportPdf, pdfMoney } from '@/lib/export'
import { effectiveMin } from '@/lib/analytics'
import type { Product } from '@/types'

export default function Products() {
  const role = useAuth((s) => s.user?.role)
  const products = useProducts()
  const categories = useCategories().data ?? []
  const inventory = useInventory().data ?? []
  const L = useLookups()
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const editable = can(role, 'products.edit')

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>()
    inventory.forEach((i) => m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity))
    return m
  }, [inventory])

  const rows = (products.data ?? []).filter((p) => !cat || p.category_id === cat)
  const exportCols = [
    { header: 'SKU', value: (p: Product) => p.sku },
    { header: 'EAN13', value: (p: Product) => p.barcode ?? '' },
    { header: 'Produit', value: (p: Product) => p.name },
    { header: 'Marque', value: (p: Product) => p.brand },
    { header: 'Catégorie', value: (p: Product) => L.category.get(p.category_id ?? '')?.name ?? '' },
    { header: 'PA HT', value: (p: Product) => pdfMoney(p.purchase_price), numeric: true },
    { header: 'PV TTC', value: (p: Product) => pdfMoney(p.selling_price), numeric: true },
    { header: 'Taux de marque', value: (p: Product) => formatPct(computeMargin(p.purchase_price, p.selling_price, p.vat_rate).markupRate), numeric: true },
    { header: 'Stock', value: (p: Product) => stockByProduct.get(p.id) ?? 0, numeric: true },
  ]

  return (
    <div>
      <PageHeader
        title="Catalogue produits"
        description={`${products.data?.length ?? 0} références cosmétiques`}
        actions={
          <>
            <ExportMenu
              onPdf={() => exportPdf('Catalogue produits', [{ name: 'Produits', columns: exportCols, rows }])}
              onExcel={() =>
                exportExcel('Catalogue produits', [
                  {
                    name: 'Produits',
                    columns: exportCols.map((c) =>
                      c.header === 'PA HT'
                        ? { ...c, value: (p: Product) => p.purchase_price }
                        : c.header === 'PV TTC'
                          ? { ...c, value: (p: Product) => p.selling_price }
                          : c,
                    ),
                    rows,
                  },
                ])
              }
            />
            {editable && (
              <Button onClick={() => setEditing({ vat_rate: 18, min_stock_level: 5, is_active: true })}>
                <Plus /> Nouveau produit
              </Button>
            )}
          </>
        }
      />
      <Card>
        <DataTable
          data={rows}
          loading={products.isLoading}
          rowKey={(p) => p.id}
          onRowClick={setDetail}
          search={(p) => `${p.name} ${p.brand} ${p.sku} ${p.barcode ?? ''}`}
          searchPlaceholder="Nom, marque, SKU, EAN…"
          toolbar={
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-48">
              <option value="">Toutes catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          }
          columns={[
            {
              key: 'name',
              header: 'Produit',
              sort: (p) => p.name,
              cell: (p) => (
                <div className="flex items-center gap-3">
                  <ProductThumb product={p} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.brand} · {p.packaging}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: 'sku',
              header: 'SKU',
              cell: (p) => (
                <div>
                  <p className="font-mono text-xs">{p.sku}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.barcode}</p>
                </div>
              ),
            },
            { key: 'cat', header: 'Catégorie', cell: (p) => <Badge variant="neutral">{L.category.get(p.category_id ?? '')?.name ?? '—'}</Badge> },
            {
              key: 'pa',
              header: 'PA HT',
              headerClassName: 'text-right',
              className: 'text-right tabular text-muted-foreground',
              cell: (p) => formatMoney(p.purchase_price),
              sort: (p) => p.purchase_price,
            },
            {
              key: 'pv',
              header: 'PV TTC',
              headerClassName: 'text-right',
              className: 'text-right font-semibold tabular',
              cell: (p) => formatMoney(p.selling_price),
              sort: (p) => p.selling_price,
            },
            {
              key: 'margin',
              header: 'Marque',
              headerClassName: 'text-right',
              className: 'text-right tabular',
              sort: (p) => computeMargin(p.purchase_price, p.selling_price, p.vat_rate).markupRate,
              cell: (p) => formatPct(computeMargin(p.purchase_price, p.selling_price, p.vat_rate).markupRate),
            },
            {
              key: 'stock',
              header: 'Stock réseau',
              headerClassName: 'text-right',
              className: 'text-right tabular',
              sort: (p) => stockByProduct.get(p.id) ?? 0,
              cell: (p) => stockByProduct.get(p.id) ?? 0,
            },
            {
              key: 'status',
              header: 'Statut',
              cell: (p) => (p.is_active ? <Badge variant="success" dot>Actif</Badge> : <Badge variant="neutral" dot>Archivé</Badge>),
            },
            ...(editable
              ? [
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-10',
                    cell: (p: Product) => (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditing(p)
                        }}
                        aria-label="Modifier"
                      >
                        <Pencil />
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          emptyTitle="Aucun produit"
        />
      </Card>
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} />}
      {detail && (
        <ProductDetail
          product={detail}
          onClose={() => setDetail(null)}
          onEdit={
            editable
              ? () => {
                  setEditing(detail)
                  setDetail(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function ProductForm({ initial, onClose }: { initial: Partial<Product>; onClose: () => void }) {
  const [p, setP] = useState<Partial<Product>>(initial)
  const categories = useCategories().data ?? []
  const suppliers = useSuppliers().data ?? []
  const products = useProducts().data ?? []
  const [uploading, setUploading] = useState(false)
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((s) => ({ ...s, [k]: v }))
  const m = computeMargin(p.purchase_price ?? 0, p.selling_price ?? 0, p.vat_rate ?? 18)
  const cat = categories.find((c) => c.id === p.category_id)
  const skuPreview = p.sku || (cat ? generateSku(cat.code, products.map((x) => x.sku)) : 'COSM-XXX-0000')

  const errors: Record<string, string> = {}
  if (!p.name?.trim()) errors.name = 'Nom requis'
  if (!p.category_id) errors.category = 'Catégorie requise'
  if ((p.purchase_price ?? 0) <= 0) errors.pa = 'Prix d’achat requis'
  if ((p.selling_price ?? 0) < (p.purchase_price ?? 0)) errors.pv = 'Le prix de vente doit être ≥ au prix d’achat'
  if (p.barcode && !isValidEan13(p.barcode)) errors.barcode = 'EAN13 invalide (13 chiffres, clé de contrôle)'
  const [touched, setTouched] = useState(false)

  const save = useAction(() => api.saveProduct(p), {
    tables: ['products'],
    success: (r) => `${r.name} enregistré (${r.sku})`,
    onSuccess: onClose,
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title={p.id ? 'Modifier le produit' : 'Nouveau produit'} description={`SKU : ${skuPreview}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (!Object.keys(errors).length) save.mutate(undefined)
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex items-center gap-4 sm:col-span-2">
            <ProductThumb product={{ name: p.name || 'Nouveau produit', image_url: p.image_url ?? null, brand: '' }} className="size-16" />
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setUploading(true)
                  try {
                    set('image_url', await api.uploadProductImage(f))
                  } catch (err) {
                    alert((err as Error).message)
                  } finally {
                    setUploading(false)
                  }
                }}
              />
              <span className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-muted">
                <ImagePlus className="size-4" /> {uploading ? 'Envoi…' : 'Téléverser une image'}
              </span>
            </label>
          </div>
          <Field label="Nom du produit *" error={touched ? errors.name : undefined} className="sm:col-span-2">
            <Input value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Marque">
            <Input value={p.brand ?? ''} onChange={(e) => set('brand', e.target.value)} />
          </Field>
          <Field label="Conditionnement">
            <Input value={p.packaging ?? ''} onChange={(e) => set('packaging', e.target.value)} placeholder="Flacon 50 ml" />
          </Field>
          <Field label="Catégorie *" error={touched ? errors.category : undefined}>
            <Select value={p.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)} disabled={!!p.id}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fournisseur principal">
            <Select value={p.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value || null)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Code-barres EAN13" error={touched ? errors.barcode : undefined}>
            <div className="flex gap-2">
              <Input value={p.barcode ?? ''} onChange={(e) => set('barcode', e.target.value.replace(/\D/g, '').slice(0, 13) || null)} className="font-mono" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Générer"
                onClick={() => set('barcode', ean13(`619${String(Date.now()).slice(-9)}`))}
              >
                <RefreshCw />
              </Button>
            </div>
          </Field>
          <Field label="Seuil de stock minimum">
            <Input type="number" min={0} value={p.min_stock_level ?? 5} onChange={(e) => set('min_stock_level', Number(e.target.value))} />
          </Field>
          <Field label="Prix d’achat HT *" error={touched ? errors.pa : undefined}>
            <Input type="number" min={0} value={p.purchase_price ?? ''} onChange={(e) => set('purchase_price', Number(e.target.value))} />
          </Field>
          <Field label="Prix de vente TTC *" error={touched ? errors.pv : undefined}>
            <Input type="number" min={0} value={p.selling_price ?? ''} onChange={(e) => set('selling_price', Number(e.target.value))} />
          </Field>
          <Field label="Taux de TVA (%)">
            <Input type="number" min={0} max={100} value={p.vat_rate ?? 18} onChange={(e) => set('vat_rate', Number(e.target.value))} />
          </Field>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">PV HT</p>
              <p className="text-sm font-semibold tabular">{formatMoney(m.sellingHT)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Marge brute</p>
              <p className={`text-sm font-semibold tabular ${m.margin < 0 ? 'text-destructive' : ''}`}>{formatMoney(m.margin)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Taux marque</p>
              <p className="text-sm font-semibold tabular">{formatPct(m.markupRate)}</p>
            </div>
          </div>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
          {p.id && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={p.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} className="accent-primary" />
              Produit actif (visible en caisse)
            </label>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProductDetail({ product: p, onClose, onEdit }: { product: Product; onClose: () => void; onEdit?: () => void }) {
  const L = useLookups()
  const inventory = (useInventory().data ?? []).filter((i) => i.product_id === p.id)
  const m = computeMargin(p.purchase_price, p.selling_price, p.vat_rate)
  const qrValue = JSON.stringify({ sku: p.sku, ean: p.barcode, name: p.name })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title={p.name} description={`${p.brand} · ${p.packaging}`}>
        <div className="grid gap-6 sm:grid-cols-[1fr_180px]">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{p.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['SKU', <span className="font-mono">{p.sku}</span>],
                ['EAN13', <span className="font-mono">{p.barcode ?? '—'}</span>],
                ['Catégorie', L.category.get(p.category_id ?? '')?.name ?? '—'],
                ['Fournisseur', L.supplier.get(p.supplier_id ?? '')?.name ?? '—'],
                ['PA HT', formatMoney(p.purchase_price)],
                ['PV TTC', formatMoney(p.selling_price)],
                ['Marge brute HT', formatMoney(m.margin)],
                ['Taux de marque', formatPct(m.markupRate)],
              ].map(([k, v], i) => (
                <div key={i} className="rounded-lg border px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-center rounded-xl border p-4">
            <QRCodeSVG value={qrValue} size={140} level="M" fgColor="#184620" />
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <QrCode className="size-3" /> Inventaire mobile
            </p>
          </div>
        </div>
        <h4 className="mb-2 mt-6 text-sm font-semibold">Stock par boutique</h4>
        <div className="divide-y rounded-xl border">
          {inventory.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{L.store.get(i.store_id)?.name}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular">{i.quantity}</span>
                <StockBadge quantity={i.quantity} min={effectiveMin(i, p)} />
              </span>
            </div>
          ))}
        </div>
        {onEdit && (
          <DialogFooter>
            <Button variant="outline" onClick={onEdit}>
              <Pencil /> Modifier
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
