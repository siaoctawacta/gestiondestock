import { useState } from 'react'
import { Pencil, Power, Trash2, UserPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { Avatar } from '@/components/common/Avatar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useAction, useLookups, useStores, useUsers } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { assignableRoles, can, ROLE_LABELS, storeScope } from '@/lib/permissions'
import { formatDateTime, timeAgo } from '@/lib/utils'
import type { Profile, UserInput } from '@/types'

export default function Users() {
  const me = useAuth((s) => s.user)!
  const users = useUsers()
  const L = useLookups()
  const [role, setRole] = useState('')
  const [editing, setEditing] = useState<UserInput | null>(null)
  const [deleting, setDeleting] = useState<Profile | null>(null)
  const manage = can(me.role, 'users.manage')
  const remove = useAction((id: string) => api.deleteUser(id), {
    tables: ['users', 'stores', 'audit_logs'],
    success: 'Utilisateur supprimé',
    onSuccess: () => setDeleting(null),
  })
  const toggle = useAction((u: Profile) => api.setUserActive(u.id, !u.is_active), {
    tables: ['users'],
    success: 'Statut du compte mis à jour',
  })
  const rows = (users.data ?? []).filter((u) => !u.deleted_at && (!role || u.role === role))

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Comptes, rôles et affectations aux boutiques"
        actions={
          manage && (
            <Button onClick={() => setEditing({ role: 'cashier', is_active: true, store_ids: [] })}>
              <UserPlus /> Nouvel utilisateur
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          loading={users.isLoading}
          rowKey={(u) => u.id}
          search={(u) => `${u.first_name} ${u.last_name} ${u.email} ${u.phone ?? ''}`}
          toolbar={
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-48">
              <option value="">Tous les rôles</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          }
          columns={[
            {
              key: 'name',
              header: 'Utilisateur',
              sort: (u) => u.last_name,
              cell: (u) => (
                <div className="flex items-center gap-3">
                  <Avatar first={u.first_name} last={u.last_name} />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {u.first_name} {u.last_name} {u.id === me.id && <span className="text-xs text-muted-foreground">(vous)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{u.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'role', header: 'Rôle', sort: (u) => u.role, cell: (u) => <Badge variant={u.role === 'super_admin' ? 'default' : 'neutral'}>{ROLE_LABELS[u.role]}</Badge> },
            {
              key: 'store',
              header: 'Affectation',
              cell: (u) => {
                const ids = [...new Set([u.store_id, ...u.store_ids].filter(Boolean) as string[])]
                return (
                  <span className="text-xs text-muted-foreground">
                    {u.role === 'super_admin' || u.role === 'stock_manager' ? 'Réseau entier' : ids.map((id) => L.store.get(id)?.name.replace('MM Cosmétiques ', '')).join(', ') || '—'}
                  </span>
                )
              },
            },
            { key: 'phone', header: 'Téléphone', cell: (u) => <span className="text-xs tabular">{u.phone ?? '—'}</span> },
            {
              key: 'login',
              header: 'Dernière connexion',
              sort: (u) => u.last_login_at ?? '',
              cell: (u) => <span className="text-xs text-muted-foreground" title={formatDateTime(u.last_login_at)}>{u.last_login_at ? timeAgo(u.last_login_at) : 'Jamais'}</span>,
            },
            { key: 'status', header: 'Statut', cell: (u) => (u.is_active ? <Badge variant="success" dot>Actif</Badge> : <Badge variant="danger" dot>Désactivé</Badge>) },
            {
              key: 'actions',
              header: '',
              cell: (u) =>
                manage ? (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)} aria-label="Modifier" title="Modifier">
                      <Pencil />
                    </Button>
                    {u.id !== me.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggle.mutate(u)}
                          aria-label={u.is_active ? 'Désactiver' : 'Réactiver'}
                          title={u.is_active ? 'Désactiver' : 'Réactiver'}
                          className={u.is_active ? 'text-amber-600' : 'text-emerald-600'}
                        >
                          <Power />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(u)}
                          aria-label="Supprimer"
                          title="Supprimer"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>
      {editing && <UserForm initial={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer l’utilisateur"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      >
        <p>
          Supprimer le compte de{' '}
          <b className="text-foreground">
            {deleting?.first_name} {deleting?.last_name}
          </b>{' '}
          ({deleting?.email}) ?
        </p>
        <p>
          La personne ne pourra plus se connecter et son email pourra être réutilisé. Ses ventes et actions passées restent
          dans l’historique. Pour une absence temporaire, préférez <b className="text-foreground">Désactiver</b>.
        </p>
      </ConfirmDialog>
    </div>
  )
}

function UserForm({ initial, onClose }: { initial: UserInput; onClose: () => void }) {
  const me = useAuth((s) => s.user)!
  const stores = (useStores().data ?? []).filter((s) => s.is_active)
  const scope = storeScope(me)
  const options = stores.filter((s) => scope === null || scope.includes(s.id))
  const [u, setU] = useState<UserInput>({ ...initial, password: '' })
  const set = (k: keyof UserInput, v: unknown) => setU((x) => ({ ...x, [k]: v }))
  const multi = u.role === 'store_admin' || u.role === 'pole_chief'
  const global = u.role === 'super_admin' || u.role === 'stock_manager'
  const save = useAction(
    () => api.saveUser({ ...u, password: u.password || undefined, store_id: global ? null : (u.store_id ?? null), store_ids: multi ? u.store_ids : [] }),
    { tables: ['users'], success: 'Compte enregistré', onSuccess: onClose },
  )
  const roles = assignableRoles(me.role)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={u.id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'} description="Les accès sont appliqués instantanément (RBAC + RLS)">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Prénom *">
            <Input value={u.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} required />
          </Field>
          <Field label="Nom *">
            <Input value={u.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} required />
          </Field>
          <Field label="Email *">
            <Input type="email" value={u.email ?? ''} onChange={(e) => set('email', e.target.value)} required />
          </Field>
          <Field label="Téléphone">
            <Input value={u.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+225 …" />
          </Field>
          <Field label="Rôle *">
            <Select value={u.role} onChange={(e) => set('role', e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {!global && (
            <Field label="Boutique principale *">
              <Select value={u.store_id ?? ''} onChange={(e) => set('store_id', e.target.value || null)} required>
                <option value="">—</option>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {multi && me.role === 'super_admin' && (
            <Field label="Boutiques supplémentaires (périmètre)" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {options.map((s) => {
                  const on = u.store_ids?.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => set('store_ids', on ? u.store_ids!.filter((x) => x !== s.id) : [...(u.store_ids ?? []), s.id])}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          <Field label={u.id ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe initial *'} hint="8 caractères minimum" className="sm:col-span-2">
            <Input type="password" value={u.password ?? ''} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" required={!u.id} minLength={8} />
          </Field>
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
