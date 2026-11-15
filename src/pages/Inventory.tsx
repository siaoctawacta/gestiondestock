import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Boxes, PackagePlus, PackageX, SlidersHorizontal, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { StatCard } from '@/components/common/StatCard'
import { ProductThumb } from '@/components/common/ProductThumb'
import { StockBadge } from '@/components/common/badges'
import { ExportMenu } from '@/components/common/ExportMenu'
import { useAction, useInventory, useLookups, useProducts, useStores } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { can, storeScope } from '@/lib/permissions'
import { effectiveMin, stockStats } from '@/lib/analytics'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils'
import { exportExcel, exportPdf, pdfMoney } from '@/lib/export'
import type { AdjustmentReason, InventoryItem } from '@/types'

export const ADJUST_REASONS: Record<AdjustmentReason, string> = {
  breakage: 'Casse',
  theft: 'Vol / démarque',
  expired: 'Péremption',
  tester: 'Testeur magasin',
  inventory: 'Correction d’inventaire',
  other: 'Autre',
}

type Row = InventoryItem & { name: string; sku: string; min: number; value: number }

export default function Inventory() {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const [params, setParams] = useSearchParams()
  const status = params.get('filter') ?? 'all'
  const inventory = useInventory()
  const L = useLookups()
  const [entryOpen, setEntryOpen] = useState(false)
  const [adjust, setAdjust] = useState<{ store_id?: string; product_id?: string } | null>(null)
  const [minEdit, setMinEdit] = useState<Row | null>(null)

  const scoped = (inventory.data ?? []).filter((i) => !activeStoreId || i.store_id === activeStoreId)
  const rows: Row[] = useMemo(
    () =>
      scoped
        .map((i) => {
          const p = L.product.get(i.product_id)
          return { ...i, name: p?.name ?? '', sku: p?.sku ?? '', min: effectiveMin(i, p), value: i.quantity * (p?.purchase_price ?? 0) }
        })
        .filter((r) => L.product.get(r.product_id)?.is_active !== false)
        .filter((r) => (status === 'alert' ? r.quantity > 0 && r.quantity <= r.min : status === 'out' ? r.quantity <= 0 : true)),
    [scoped, L, status],
  )
  const stats = stockStats(scoped, L.product)
  const canMove = can(user.role, 'inventory.move')
  const canAdjust = can(user.role, 'inventory.adjust')

  const exportCols = [
    { header: 'Boutique', value: (r: Row) => L.store.get(r.store_id)?.name ?? '' },
    { header: 'SKU', value: (r: Row) => r.sku },
    { header: 'Produit', value: (r: Row) => r.name },
    { header: 'Quantité', value: (r: Row) => r.quantity, numeric: true },
    { header: 'Seuil', value: (r: Row) => r.min, numeric: true },
    { header: 'Valeur PA HT', value: (r: Row) => pdfMoney(r.value), numeric: true },
  ]

  return (
    <div>
      <PageHeader
        title="Gestion des stocks"
        description={activeStoreId ? L.store.get(activeStoreId)?.name : 'Toutes les boutiques de votre périmètre'}
        actions={
          <>
            <ExportMenu
              onPdf={() =>
                exportPdf('État des stocks', [{ name: 'Stock', columns: exportCols, rows }], {
                  summary: [
                    ['Valeur stock PA HT', pdfMoney(stats.valueHT)],
                    ['Unités', formatNumber(stats.units)],
                    ['Ruptures', String(stats.out)],
                    ['Stocks faibles', String(stats.low)],
                  ],
                })
              }
              onExcel={() =>
                exportExcel('État des stocks', [
                  { name: 'Stock', columns: exportCols.map((c) => (c.header === 'Valeur PA HT' ? { ...c, value: (r: Row) => r.value } : c)), rows },
                ])
              }
            />
            {canAdjust && (
              <Button variant="outline" onClick={() => setAdjust({})}>
                <SlidersHorizontal /> Ajustement
              </Button>
            )}
            {canMove && (
              <Button onClick={() => setEntryOpen(true)}>
                <PackagePlus /> Entrée de stock
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Valeur du stock (PA HT)" value={formatMoney(stats.valueHT)} icon={Wallet} hint={`Valeur vente ${formatMoney(stats.retailValue)}`} loading={inventory.isLoading} />
        <StatCard label="Unités en stock" value={formatNumber(stats.units)} icon={Boxes} loading={inventory.isLoading} tone="success" />
        <StatCard label="Stocks faibles" value={String(stats.low)} icon={AlertTriangle} tone="warning" loading={inventory.isLoading} />
        <StatCard label="Ruptures" value={String(stats.out)} icon={PackageX} tone="danger" loading={inventory.isLoading} />
      </div>
      <Card>
        <DataTable
          data={rows}
          loading={inventory.isLoading}
          rowKey={(r) => r.id}
          search={(r) => `${r.name} ${r.sku} ${L.store.get(r.store_id)?.name}`}
          toolbar={
            <Tabs value={status} onValueChange={(v) => setParams(v === 'all' ? {} : { filter: v })}>
              <TabsList>
                <TabsTrigger value="all">Tous</TabsTrigger>
                <TabsTrigger value="alert">Stock faible</TabsTrigger>
                <TabsTrigger value="out">Ruptures</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          initialSort={{ key: 'qty', dir: 'asc' }}
          pageSize={15}
          columns={[
            {
              key: 'name',
              header: 'Produit',
              sort: (r) => r.name,
              cell: (r) => {
                const p = L.product.get(r.product_id)
                return (
                  <div className="flex items-center gap-3">
                    {p && <ProductThumb product={p} className="size-9" />}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{r.sku}</p>
                    </div>
                  </div>
                )
              },
            },
            { key: 'store', header: 'Boutique', sort: (r) => L.store.get(r.store_id)?.name ?? '', cell: (r) => <span className="text-muted-foreground">{L.store.get(r.store_id)?.name}</span> },
            { key: 'qty', header: 'Quantité', headerClassName: 'text-right', className: 'text-right font-semibold tabular', sort: (r) => r.quantity, cell: (r) => r.quantity },
            {
              key: 'min',
              header: 'Seuil',
              headerClassName: 'text-right',
              className: 'text-right tabular',
              cell: (r) =>
                canAdjust ? (
                  <button className="rounded px-1.5 py-0.5 text-muted-foreground underline decoration-dotted underline-offset-4 hover:bg-muted hover:text-foreground" onClick={() => setMinEdit(r)}>
                    {r.min}
                  </button>
                ) : (
                  r.min
                ),
            },
            { key: 'value', header: 'Valeur PA HT', headerClassName: 'text-right', className: 'text-right tabular text-muted-foreground', sort: (r) => r.value, cell: (r) => formatMoney(r.value) },
            { key: 'status', header: 'État', cell: (r) => <StockBadge quantity={r.quantity} min={r.min} /> },
            { key: 'updated', header: 'Mis à jour', cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.updated_at)}</span> },
            ...(canAdjust
              ? [
                  {
                    key: 'act',
                    header: '',
                    cell: (r: Row) => (
                      <Button variant="ghost" size="sm" onClick={() => setAdjust({ store_id: r.store_id, product_id: r.product_id })}>
                        Ajuster
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          emptyTitle="Aucune ligne de stock"
        />
      </Card>
      {entryOpen && <StockEntryDialog onClose={() => setEntryOpen(false)} />}
      {adjust && <AdjustDialog initial={adjust} onClose={() => setAdjust(null)} />}
      {minEdit && <MinLevelDialog row={minEdit} onClose={() => setMinEdit(null)} />}
    </div>
  )
}

function useScopedStores() {
  const user = useAuth((s) => s.user)
  const stores = useStores().data ?? []
  const scope = storeScope(user)
  return stores.filter((s) => s.is_active && (scope === null || scope.includes(s.id)))
}

function StockEntryDialog({ onClose }: { onClose: () => void }) {
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const stores = useScopedStores()
  const products = (useProducts().data ?? []).filter((p) => p.is_active)
  const [f, setF] = useState({
    store_id: activeStoreId ?? stores[0]?.id ?? '',
    product_id: '',
    quantity: 1,
    lot_number: '',
    expiry_date: '',
    reference: '',
  })
  const save = useAction(
    () => api.stockEntry({ ...f, expiry_date: f.expiry_date || null, reference: f.reference || null }),
    { tables: ['inventory', 'movements', 'notifications'], success: 'Entrée de stock enregistrée', onSuccess: onClose },
  )
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Entrée de stock" description="Réception de marchandise avec traçabilité lot / péremption">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Boutique *">
            <Select value={f.store_id} onChange={(e) => setF({ ...f, store_id: e.target.value })} required>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantité reçue *">
            <Input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} required />
          </Field>
          <Field label="Produit *" className="sm:col-span-2">
            <Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })} required>
              <option value="">Sélectionner…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.sku}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Numéro de lot *">
            <Input value={f.lot_number} onChange={(e) => setF({ ...f, lot_number: e.target.value })} placeholder="LOT-2026-001" required />
          </Field>
          <Field label="Date de péremption" hint="Obligatoire pour les soins et maquillage">
            <Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} />
          </Field>
          <Field label="Référence bon de réception" className="sm:col-span-2">
            <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="BR-…" />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!f.product_id || !f.store_id}>
              Enregistrer l’entrée
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdjustDialog({ initial, onClose }: { initial: { store_id?: string; product_id?: string }; onClose: () => void }) {
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const stores = useScopedStores()
  const products = (useProducts().data ?? []).filter((p) => p.is_active)
  const inventory = useInventory().data ?? []
  const [f, setF] = useState({
    store_id: initial.store_id ?? activeStoreId ?? stores[0]?.id ?? '',
    product_id: initial.product_id ?? '',
    direction: 'out' as 'in' | 'out',
    quantity: 1,
    reason: 'breakage' as AdjustmentReason,
    note: '',
  })
  const current = inventory.find((i) => i.store_id === f.store_id && i.product_id === f.product_id)?.quantity ?? 0
  const signed = f.direction === 'out' ? -f.quantity : f.quantity
  const save = useAction(
    () => api.adjustStock({ store_id: f.store_id, product_id: f.product_id, quantity: signed, reason: f.reason, note: f.note }),
    { tables: ['inventory', 'movements', 'notifications', 'audit_logs'], success: 'Ajustement enregistré', onSuccess: onClose },
  )
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Ajustement de stock" description="Casse, vol, péremption, testeurs — motif obligatoire, tracé dans l’audit">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Boutique">
            <Select value={f.store_id} onChange={(e) => setF({ ...f, store_id: e.target.value })}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Produit">
            <Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })} required>
              <option value="">Sélectionner…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sens">
            <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
              {(['out', 'in'] as const).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setF({ ...f, direction: d })}
                  className={`rounded-md py-1.5 text-xs font-medium ${f.direction === d ? 'bg-muted' : 'text-muted-foreground'}`}
                >
                  {d === 'out' ? 'Sortie (−)' : 'Correction (+)'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Quantité" hint={f.product_id ? `Stock actuel : ${current} → ${current + signed}` : undefined}>
            <Input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Motif *" className="sm:col-span-2">
            <Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value as AdjustmentReason })}>
              {Object.entries(ADJUST_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Commentaire" className="sm:col-span-2">
            <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Détail de l’incident…" />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant={f.direction === 'out' ? 'destructive' : 'default'} loading={save.isPending} disabled={!f.product_id || current + signed < 0}>
              Valider l’ajustement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MinLevelDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const L = useLookups()
  const [v, setV] = useState(String(row.min_stock_level ?? ''))
  const save = useAction(() => api.setStoreMinLevel(row.store_id, row.product_id, v === '' ? null : Number(v)), {
    tables: ['inventory'],
    success: 'Seuil mis à jour',
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title="Seuil d’alerte boutique" description={`${row.name} · ${L.store.get(row.store_id)?.name}`}>
        <Field label="Seuil minimum" hint={`Laisser vide pour utiliser le seuil catalogue (${L.product.get(row.product_id)?.min_stock_level})`}>
          <Input type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
