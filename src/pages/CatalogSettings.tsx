import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PageHeader } from '@/components/common/PageHeader'
import { useAction, useCategories, useProducts, useSuppliers } from '@/hooks/queries'
import { api } from '@/data'
import type { Category, Supplier } from '@/types'

export default function CatalogSettings() {
  const categories = useCategories().data ?? []
  const suppliers = useSuppliers().data ?? []
  const products = useProducts().data ?? []
  const [cat, setCat] = useState<Partial<Category> | null>(null)
  const [sup, setSup] = useState<Partial<Supplier> | null>(null)
  const delCat = useAction((id: string) => api.deleteCategory(id), { tables: ['categories'], success: 'Catégorie supprimée' })
  const delSup = useAction((id: string) => api.deleteSupplier(id), { tables: ['suppliers'], success: 'Fournisseur supprimé' })

  return (
    <div>
      <PageHeader title="Catégories & fournisseurs" description="Référentiels du catalogue cosmétique" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Catégories</CardTitle>
              <CardDescription>Le code (3 lettres) compose le SKU : COSM-CODE-0001</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCat({})}>
              <Plus /> Ajouter
            </Button>
          </CardHeader>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Nom</TH>
                <TH>Code</TH>
                <TH className="text-right">Produits</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {categories.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="font-mono text-xs">{c.code}</TD>
                  <TD className="text-right tabular">{products.filter((p) => p.category_id === c.id).length}</TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setCat(c)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => confirm(`Supprimer « ${c.name} » ?`) && delCat.mutate(c.id)}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fournisseurs</CardTitle>
              <CardDescription>{suppliers.length} fournisseur(s) référencé(s)</CardDescription>
            </div>
            <Button size="sm" onClick={() => setSup({})}>
              <Plus /> Ajouter
            </Button>
          </CardHeader>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Fournisseur</TH>
                <TH>Contact</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {suppliers.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.email}</p>
                  </TD>
                  <TD className="text-xs">
                    <p>{s.contact_name}</p>
                    <p className="text-muted-foreground">{s.phone}</p>
                  </TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setSup(s)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => confirm(`Supprimer « ${s.name} » ?`) && delSup.mutate(s.id)}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
      {cat && <CategoryForm initial={cat} onClose={() => setCat(null)} />}
      {sup && <SupplierForm initial={sup} onClose={() => setSup(null)} />}
    </div>
  )
}

function CategoryForm({ initial, onClose }: { initial: Partial<Category>; onClose: () => void }) {
  const [c, setC] = useState(initial)
  const save = useAction(() => api.saveCategory(c), { tables: ['categories'], success: 'Catégorie enregistrée', onSuccess: onClose })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" title={c.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Nom *">
            <Input value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} required />
          </Field>
          <Field label="Code (3 lettres) *">
            <Input
              value={c.code ?? ''}
              maxLength={3}
              onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
              required
              disabled={!!c.id}
              className="font-mono uppercase"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SupplierForm({ initial, onClose }: { initial: Partial<Supplier>; onClose: () => void }) {
  const [s, setS] = useState(initial)
  const save = useAction(() => api.saveSupplier(s), { tables: ['suppliers'], success: 'Fournisseur enregistré', onSuccess: onClose })
  const field = (k: keyof Supplier, label: string, type = 'text') => (
    <Field label={label}>
      <Input type={type} value={(s[k] as string) ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} required={k === 'name'} />
    </Field>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={s.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          {field('name', 'Raison sociale *')}
          {field('contact_name', 'Contact')}
          {field('phone', 'Téléphone')}
          {field('email', 'Email', 'email')}
          <div className="sm:col-span-2">{field('address', 'Adresse')}</div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
