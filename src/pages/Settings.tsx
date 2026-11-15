import { useState } from 'react'
import { Database, KeyRound, RotateCcw, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/PageHeader'
import { Avatar } from '@/components/common/Avatar'
import { useAuth } from '@/store/auth'
import { useAction, useLookups } from '@/hooks/queries'
import { api, resetDemoData } from '@/data'
import { can, ROLE_LABELS, type Permission } from '@/lib/permissions'

const PERMS: [Permission, string][] = [
  ['pos', 'Encaissement POS'],
  ['products.edit', 'Gestion du catalogue'],
  ['inventory.move', 'Entrées de stock'],
  ['inventory.adjust', 'Ajustements'],
  ['transfers.create', 'Émission de transferts'],
  ['reports.daily.edit', 'Saisie des déclarations'],
  ['reports.daily.validate', 'Validation des déclarations'],
  ['analytics', 'Rapports & exports'],
  ['users.manage', 'Gestion des utilisateurs'],
  ['stores.edit', 'Configuration des boutiques'],
  ['audit', 'Journal d’audit'],
]

export default function Settings() {
  const { user, setUser } = useAuth()
  const L = useLookups()
  const [profile, setProfile] = useState({ first_name: user!.first_name, last_name: user!.last_name, phone: user!.phone ?? '' })
  const [pw, setPw] = useState({ next: '', confirm: '' })
  const saveProfile = useAction(() => api.updateOwnProfile({ ...profile, phone: profile.phone || null }), {
    success: 'Profil mis à jour',
    tables: ['users'],
    onSuccess: setUser,
  })
  const savePw = useAction(() => api.updatePassword(pw.next), { success: 'Mot de passe modifié', onSuccess: () => setPw({ next: '', confirm: '' }) })
  const u = user!
  const stores = [...new Set([u.store_id, ...u.store_ids].filter(Boolean) as string[])]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Paramètres" description="Profil, sécurité et habilitations" />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <Avatar first={u.first_name} last={u.last_name} className="size-14 text-base" />
          <div className="flex-1">
            <p className="text-lg font-semibold">
              {u.first_name} {u.last_name}
            </p>
            <p className="text-sm text-muted-foreground">{u.email}</p>
          </div>
          <div className="text-right">
            <Badge>{ROLE_LABELS[u.role]}</Badge>
            <p className="mt-1 text-xs text-muted-foreground">
              {stores.length ? stores.map((id) => L.store.get(id)?.name).join(', ') : 'Réseau entier'}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserRound className="size-4" /> Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(undefined) }}>
              <Field label="Prénom"><Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} /></Field>
              <Field label="Nom"><Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} /></Field>
              <Field label="Téléphone"><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
              <Button loading={saveProfile.isPending}>Enregistrer</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (pw.next !== pw.confirm) return void toast.error('Les mots de passe ne correspondent pas')
                savePw.mutate(undefined)
              }}
            >
              <Field label="Nouveau mot de passe" hint="8 caractères minimum"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
              <Field label="Confirmation"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
              <Button loading={savePw.isPending} disabled={pw.next.length < 8}>Modifier</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Mes habilitations</CardTitle>
            <CardDescription>Dérivées de votre rôle — appliquées côté interface et en base (RLS)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PERMS.map(([p, label]) => (
            <div key={p} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              {label}
              {can(u.role, p) ? <Badge variant="success">Autorisé</Badge> : <Badge variant="neutral">—</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
      {api.mode === 'demo' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Données de démonstration</CardTitle>
              <CardDescription>Réinitialise toutes les données locales (ventes, stocks, déclarations).</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (!confirm('Réinitialiser toutes les données de démonstration ?')) return
                resetDemoData()
                toast.success('Données réinitialisées')
              }}
            >
              <RotateCcw /> Réinitialiser
            </Button>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
