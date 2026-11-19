import { useState } from 'react'
import { ArrowRight, CheckCircle2, PackageCheck, Plus, Trash2, Truck, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { TransferStatusBadge } from '@/components/common/badges'
import { ProductThumb } from '@/components/common/ProductThumb'
import { useAction, useInventory, useLookups, useProducts, useStores, useTransfers } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { can, inScope, storeScope } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils'
import type { Transfer, TransferItem } from '@/types'

export default function Transfers() {
  const user = useAuth((s) => s.user)!
  const transfers = useTransfers()
  const L = useLookups()
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Transfer | null>(null)
  const rows = (transfers.data ?? []).filter((t) => status === 'all' || t.status === status)

  return (
    <div>
      <PageHeader
        title="Transferts inter-boutiques"
        description="Workflow en 2 étapes : expédition (en transit) puis réception validée par la boutique destinataire"
        actions={
          can(user.role, 'transfers.create') && (
            <Button onClick={() => setCreating(true)}>
              <Truck /> Nouveau transfert
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          loading={transfers.isLoading}
          rowKey={(t) => t.id}
          onRowClick={setSelected}
          search={(t) => `${t.reference} ${L.store.get(t.source_store_id)?.name} ${L.store.get(t.dest_store_id)?.name}`}
          toolbar={
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList>
                <TabsTrigger value="all">Tous</TabsTrigger>
                <TabsTrigger value="in_transit">En transit</TabsTrigger>
                <TabsTrigger value="received">Reçus</TabsTrigger>
                <TabsTrigger value="cancelled">Annulés</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          columns={[
            {
              key: 'ref',
              header: 'Bon de transfert',
              sort: (t) => t.created_at,
              cell: (t) => (
                <div>
                  <p className="font-medium tabular">{t.reference}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(t.created_at)}</p>
                </div>
              ),
            },
            {
              key: 'route',
              header: 'Trajet',
              cell: (t) => (
                <span className="flex items-center gap-2 text-sm">
                  {L.store.get(t.source_store_id)?.name}
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  {L.store.get(t.dest_store_id)?.name}
                </span>
              ),
            },
            { key: 'lines', header: 'Réf.', cell: (t) => <span className="tabular">{t.items.length}</span> },
            { key: 'qty', header: 'Unités', cell: (t) => <span className="font-semibold tabular">{t.items.reduce((a, i) => a + i.quantity, 0)}</span> },
            { key: 'status', header: 'Statut', cell: (t) => <TransferStatusBadge status={t.status} /> },
            {
              key: 'recv',
              header: 'Réception',
              cell: (t) => <span className="text-xs text-muted-foreground">{t.received_at ? formatDateTime(t.received_at) : '—'}</span>,
            },
          ]}
          initialSort={{ key: 'ref', dir: 'desc' }}
          emptyTitle="Aucun transfert"
        />
      </Card>
      {creating && <TransferForm onClose={() => setCreating(false)} />}
      {selected && <TransferDetail transfer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function TransferForm({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const stores = (useStores().data ?? []).filter((s) => s.is_active)
  const scope = storeScope(user)
  const sources = stores.filter((s) => scope === null || scope.includes(s.id))
  const products = (useProducts().data ?? []).filter((p) => p.is_active)
  const inventory = useInventory().data ?? []
  const [source, setSource] = useState(activeStoreId ?? sources[0]?.id ?? '')
  const [dest, setDest] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransferItem[]>([{ product_id: '', quantity: 1 }])
  const avail = (pid: string) => inventory.find((i) => i.store_id === source && i.product_id === pid)?.quantity ?? 0
  const valid = source && dest && source !== dest && items.some((i) => i.product_id && i.quantity > 0) && items.every((i) => !i.product_id || i.quantity <= avail(i.product_id))

  const save = useAction(
    () =>
      api.createTransfer({
        source_store_id: source,
        dest_store_id: dest,
        notes: notes || null,
        items: items.filter((i) => i.product_id && i.quantity > 0),
      }),
    { tables: ['transfers', 'notifications'], success: (t) => `Bon ${t.reference} émis — en transit`, onSuccess: onClose },
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title="Nouveau transfert" description="Étape 1 — Expédition : le bon passe au statut « En transit »">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="Boutique source">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <ArrowRight className="mx-auto mb-2.5 hidden size-4 text-muted-foreground sm:block" />
          <Field label="Boutique destination">
            <Select value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">Sélectionner…</option>
              {stores
                .filter((s) => s.id !== source)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Articles</p>
          {items.map((it, idx) => {
            const a = it.product_id ? avail(it.product_id) : null
            return (
              <div key={idx} className="flex items-start gap-2">
                <Select
                  value={it.product_id}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)))}
                  className="flex-1"
                >
                  <option value="">Produit…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={items.some((x, i) => i !== idx && x.product_id === p.id)}>
                      {p.name} ({avail(p.id)} dispo)
                    </option>
                  ))}
                </Select>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))}
                    className={a !== null && it.quantity > a ? 'border-destructive' : ''}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                  <Trash2 />
                </Button>
              </div>
            )
          })}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { product_id: '', quantity: 1 }])}>
            <Plus /> Ajouter une ligne
          </Button>
        </div>
        <Field label="Notes" className="mt-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motif, transporteur…" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => save.mutate(undefined)} disabled={!valid} loading={save.isPending}>
            <Truck /> Expédier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferDetail({ transfer: t, onClose }: { transfer: Transfer; onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const L = useLookups()
  const receive = useAction(() => api.receiveTransfer(t.id), {
    tables: ['transfers', 'inventory', 'movements', 'notifications'],
    success: `${t.reference} réceptionné — stocks mis à jour`,
    onSuccess: onClose,
  })
  const cancel = useAction(() => api.cancelTransfer(t.id), { tables: ['transfers'], success: 'Transfert annulé', onSuccess: onClose })
  const canReceive = t.status === 'in_transit' && can(user.role, 'transfers.receive') && inScope(user, t.dest_store_id)
  const canCancel = t.status === 'in_transit' && can(user.role, 'transfers.create') && inScope(user, t.source_store_id)
  const creator = L.user.get(t.created_by)
  const receiver = t.received_by ? L.user.get(t.received_by) : null

  const steps = [
    { label: 'Expédié', done: true, date: t.created_at, by: creator },
    { label: t.status === 'cancelled' ? 'Annulé' : 'Réceptionné', done: t.status !== 'in_transit', date: t.received_at, by: receiver },
  ]

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title={`Bon ${t.reference}`} description={`${L.store.get(t.source_store_id)?.name} → ${L.store.get(t.dest_store_id)?.name}`}>
        <div className="flex items-center gap-3">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-1 items-center gap-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${s.done ? (t.status === 'cancelled' && i === 1 ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600') : 'bg-amber-500/10 text-amber-600'}`}>
                {s.done ? i === 1 && t.status === 'cancelled' ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" /> : <Truck className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.done ? s.label : 'En transit'}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {s.date ? formatDateTime(s.date) : 'En attente de réception'}
                  {s.by && ` · ${s.by.first_name} ${s.by.last_name}`}
                </p>
              </div>
              {i === 0 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>
        <div className="mt-5 divide-y rounded-xl border">
          {t.items.map((i) => {
            const p = L.product.get(i.product_id)
            return (
              <div key={i.product_id} className="flex items-center gap-3 px-4 py-2.5">
                {p && <ProductThumb product={p} className="size-8" />}
                <span className="flex-1 text-sm">{p?.name}</span>
                <span className="font-semibold tabular">× {i.quantity}</span>
              </div>
            )
          })}
        </div>
        {t.notes && <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t.notes}</p>}
        {(canReceive || canCancel) && (
          <DialogFooter>
            {canCancel && (
              <Button variant="outline" onClick={() => cancel.mutate(undefined)} loading={cancel.isPending}>
                Annuler le transfert
              </Button>
            )}
            {canReceive && (
              <Button variant="success" onClick={() => receive.mutate(undefined)} loading={receive.isPending}>
                <PackageCheck /> Valider la réception
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
