import { useState } from 'react'
import { Mail, MapPin, Pencil, Phone, Plus, Store as StoreIcon, Trash2, UserRound } from 'lucide-react'
import { subDays } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useAction, useInventory, useLookups, useSales, useStores, useUsers } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { can, storeScope } from '@/lib/permissions'
import { inRange, stockStats, summarize } from '@/lib/analytics'
import { formatCompact } from '@/lib/utils'
import type { Store } from '@/types'

export default function Stores() {
  const user = useAuth((s) => s.user)!
  const stores = useStores()
  const L = useLookups()
  const sales = useSales({ from: subDays(new Date(), 29).toISOString().slice(0, 10) }).data ?? []
  const inventory = useInventory().data ?? []
  const [editing, setEditing] = useState<Partial<Store> | null>(null)
  const [deleting, setDeleting] = useState<Store | null>(null)
  const remove = useAction((id: string) => api.deleteStore(id), {
    tables: ['stores', 'users', 'inventory', 'audit_logs'],
    success: 'Boutique supprimée',
    onSuccess: () => setDeleting(null),
  })
  const scope = storeScope(user)
  const list = (stores.data ?? []).filter((s) => !s.deleted_at && (scope === null || scope.includes(s.id)))
  const editable = can(user.role, 'stores.edit')

  return (
    <div>
      <PageHeader
        title="Réseau de boutiques"
        description={`${list.length} point(s) de vente`}
        actions={
          editable && (
            <Button onClick={() => setEditing({ is_active: true })}>
              <Plus /> Nouvelle boutique
            </Button>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => {
          const k = summarize(inRange(sales.filter((x) => x.store_id === s.id), subDays(new Date(), 29), new Date()))
          const st = stockStats(inventory.filter((i) => i.store_id === s.id), L.product)
          const manager = s.manager_id ? L.user.get(s.manager_id) : null
          return (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <StoreIcon className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {s.code} · {s.region}
                    </p>
                  </div>
                </div>
                {s.is_active ? <Badge variant="success" dot>Active</Badge> : <Badge variant="neutral" dot>Fermée</Badge>}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><MapPin className="size-3.5" />{s.address}</li>
                <li className="flex items-center gap-2"><Phone className="size-3.5" />{s.phone}</li>
                <li className="flex items-center gap-2"><Mail className="size-3.5" />{s.email}</li>
                <li className="flex items-center gap-2">
                  <UserRound className="size-3.5" />
                  {manager ? `${manager.first_name} ${manager.last_name}` : 'Responsable non assigné'}
                </li>
              </ul>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">CA 30 j</p>
                  <p className="text-sm font-semibold tabular">{formatCompact(k.revenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Ventes</p>
                  <p className="text-sm font-semibold tabular">{k.count}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Stock</p>
                  <p className="text-sm font-semibold tabular">{formatCompact(st.valueHT)}</p>
                </div>
              </div>
              {(st.out > 0 || st.low > 0) && (
                <p className="mt-3 text-[11px] text-amber-700">
                  {st.out} rupture(s) · {st.low} stock(s) faible(s)
                </p>
              )}
              {editable && (
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(s)}>
                    <Pencil /> Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleting(s)}
                    aria-label={`Supprimer ${s.name}`}
                  >
                    <Trash2 /> Supprimer
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {editing && <StoreForm initial={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer la boutique"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      >
        <p>
          Supprimer <b className="text-foreground">{deleting?.name}</b> du réseau ?
        </p>
        <p>
          Elle disparaît des listes, de la caisse et des sélections. Ses ventes, mouvements de stock et déclarations
          restent dans l’historique et les rapports.
        </p>
      </ConfirmDialog>
    </div>
  )
}

function StoreForm({ initial, onClose }: { initial: Partial<Store>; onClose: () => void }) {
  const [s, setS] = useState(initial)
  const users = (useUsers().data ?? []).filter((u) => u.is_active && ['store_manager', 'store_admin', 'super_admin'].includes(u.role))
  const save = useAction(() => api.saveStore(s), { tables: ['stores'], success: 'Boutique enregistrée', onSuccess: onClose })
  const set = (k: keyof Store, v: unknown) => setS((x) => ({ ...x, [k]: v }))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={s.id ? 'Modifier la boutique' : 'Nouvelle boutique'} description="Fiche du point de vente">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Nom officiel *">
            <Input value={s.name ?? ''} onChange={(e) => set('name', e.target.value)} required />
          </Field>
          <Field label="Code boutique unique *">
            <Input value={s.code ?? ''} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="BTQ-XXX" required className="font-mono" />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={s.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <Input value={s.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email de contact">
            <Input type="email" value={s.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Région / Pôle">
            <Input value={s.region ?? ''} onChange={(e) => set('region', e.target.value)} />
          </Field>
          <Field label="Responsable assigné">
            <Select value={s.manager_id ?? ''} onChange={(e) => set('manager_id', e.target.value || null)}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </Select>
          </Field>
          {s.id && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="accent-primary" checked={s.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} />
              Boutique active
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

