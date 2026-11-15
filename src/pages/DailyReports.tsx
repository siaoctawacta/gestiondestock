import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, ClipboardCheck, FilePlus2, Plus, Send, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { StatCard } from '@/components/common/StatCard'
import { ReportStatusBadge } from '@/components/common/badges'
import { useAction, useDailyReports, useLookups, useStores } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { can, CASH_VARIANCE_TOLERANCE, inScope, storeScope } from '@/lib/permissions'
import { computeVariance } from '@/data/logic'
import { cn, formatDate, formatDateTime, formatMoney, formatPct, todayISO } from '@/lib/utils'
import type { DailyReport } from '@/types'

const EXPENSE_CATEGORIES = ['Transport', 'Fournitures', 'Entretien', 'Restauration', 'Électricité / eau', 'Divers']

function VarianceCell({ r }: { r: Pick<DailyReport, 'variance' | 'variance_pct'> }) {
  const out = Math.abs(r.variance_pct) > CASH_VARIANCE_TOLERANCE
  return (
    <div className="text-right">
      <p className={cn('font-semibold tabular', r.variance < 0 ? 'text-red-600' : r.variance > 0 ? 'text-emerald-600' : '')}>
        {r.variance > 0 ? '+' : ''}
        {formatMoney(r.variance)}
      </p>
      <p className={cn('text-[11px] tabular', out ? 'font-medium text-red-600' : 'text-muted-foreground')}>
        {out && <AlertTriangle className="mr-1 inline size-3" />}
        {formatPct(r.variance_pct)}
      </p>
    </div>
  )
}

export default function DailyReports() {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const reports = useDailyReports()
  const L = useLookups()
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<DailyReport | 'new' | null>(null)
  const [selected, setSelected] = useState<DailyReport | null>(null)
  const all = (reports.data ?? []).filter((r) => !activeStoreId || r.store_id === activeStoreId)
  const rows = all.filter((r) => status === 'all' || r.status === status)
  const pending = all.filter((r) => r.status === 'submitted')
  const outOfTolerance = all.filter((r) => r.status !== 'draft' && Math.abs(r.variance_pct) > CASH_VARIANCE_TOLERANCE)
  const totalExpenses = all.filter((r) => r.status === 'validated').reduce((a, r) => a + r.expenses_total, 0)
  const canEdit = can(user.role, 'reports.daily.edit')

  return (
    <div>
      <PageHeader
        title="Déclarations journalières"
        description="Contrôle quotidien des caisses : montant théorique POS vs montant physique déclaré"
        actions={
          canEdit && (
            <Button onClick={() => setEditing('new')}>
              <FilePlus2 /> Nouvelle déclaration
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="En attente de validation" value={String(pending.length)} icon={ClipboardCheck} loading={reports.isLoading} />
        <StatCard label={`Écarts > ${CASH_VARIANCE_TOLERANCE} %`} value={String(outOfTolerance.length)} icon={AlertTriangle} tone="danger" loading={reports.isLoading} />
        <StatCard label="Dépenses validées" value={formatMoney(totalExpenses)} icon={Check} tone="success" loading={reports.isLoading} />
      </div>
      <Card>
        <DataTable
          data={rows}
          loading={reports.isLoading}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
          search={(r) => `${L.store.get(r.store_id)?.name} ${r.report_date}`}
          toolbar={
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList>
                <TabsTrigger value="all">Toutes</TabsTrigger>
                <TabsTrigger value="draft">Brouillons</TabsTrigger>
                <TabsTrigger value="submitted">Envoyées</TabsTrigger>
                <TabsTrigger value="validated">Validées</TabsTrigger>
                <TabsTrigger value="rejected">Rejetées</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          columns={[
            {
              key: 'date',
              header: 'Journée',
              sort: (r) => r.report_date,
              cell: (r) => (
                <div>
                  <p className="font-medium">{formatDate(r.report_date, 'EEEE dd MMM')}</p>
                  <p className="text-[11px] text-muted-foreground">{L.store.get(r.store_id)?.name}</p>
                </div>
              ),
            },
            { key: 'theo', header: 'Théorique POS', headerClassName: 'text-right', className: 'text-right tabular', cell: (r) => formatMoney(r.theoretical_amount) },
            { key: 'decl', header: 'Déclaré', headerClassName: 'text-right', className: 'text-right tabular', cell: (r) => formatMoney(r.declared_amount) },
            { key: 'exp', header: 'Dépenses', headerClassName: 'text-right', className: 'text-right tabular text-muted-foreground', cell: (r) => formatMoney(r.expenses_total) },
            { key: 'var', header: 'Écart', headerClassName: 'text-right', sort: (r) => Math.abs(r.variance_pct), cell: (r) => <VarianceCell r={r} /> },
            { key: 'status', header: 'Statut', cell: (r) => <ReportStatusBadge status={r.status} /> },
          ]}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyTitle="Aucune déclaration"
        />
      </Card>
      {editing && <ReportForm report={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {selected && (
        <ReportDetail
          report={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function ReportForm({ report, onClose }: { report: DailyReport | null; onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const stores = (useStores().data ?? []).filter((s) => s.is_active)
  const scope = storeScope(user)
  const options = stores.filter((s) => scope === null || scope.includes(s.id))
  const [storeId, setStoreId] = useState(report?.store_id ?? activeStoreId ?? options[0]?.id ?? '')
  const [date, setDate] = useState(report?.report_date ?? todayISO())
  const [declared, setDeclared] = useState(report ? String(report.declared_amount) : '')
  const [notes, setNotes] = useState(report?.notes ?? '')
  const [expenses, setExpenses] = useState(report?.expenses.map(({ label, category, amount }) => ({ label, category, amount })) ?? [])

  const theo = useQuery({
    queryKey: ['theoretical', storeId, date],
    queryFn: () => api.theoreticalAmount(storeId, date),
    enabled: !!storeId && !!date,
  })
  const theoretical = theo.data ?? 0
  const expTotal = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0)
  const v = computeVariance(theoretical, Number(declared) || 0, expTotal)
  const outTol = Math.abs(v.variance_pct) > CASH_VARIANCE_TOLERANCE

  const payload = () => ({
    id: report?.id,
    store_id: storeId,
    report_date: date,
    declared_amount: Number(declared) || 0,
    notes: notes || null,
    expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) || 0 })),
  })
  const save = useAction(() => api.saveDailyReport(payload()), { tables: ['daily_reports'], success: 'Brouillon enregistré', onSuccess: onClose })
  const submit = useAction(
    async () => {
      const r = await api.saveDailyReport(payload())
      await api.submitDailyReport(r.id)
    },
    { tables: ['daily_reports', 'notifications'], success: 'Déclaration envoyée pour validation', onSuccess: onClose },
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={report ? 'Modifier la déclaration' : 'Nouvelle déclaration'} description="Saisie de fin de journée">
        {report?.status === 'rejected' && report.rejection_reason && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700">
            <b>Motif du rejet :</b> {report.rejection_reason}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Boutique">
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!!report}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date de la journée">
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={!!report} />
          </Field>
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Montant théorique POS</p>
            <p className="mt-1 text-xl font-semibold tabular">{theo.isLoading ? '…' : formatMoney(theoretical)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Calculé automatiquement depuis les ventes</p>
          </div>
          <Field label="Montant physique encaissé (coffre)">
            <Input type="number" min={0} value={declared} onChange={(e) => setDeclared(e.target.value)} className="h-12 text-lg font-semibold tabular" placeholder="0" />
          </Field>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Dépenses de fonctionnement</p>
            <Button variant="outline" size="sm" onClick={() => setExpenses([...expenses, { label: '', category: 'Transport', amount: 0 }])}>
              <Plus /> Ajouter
            </Button>
          </div>
          {expenses.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucune dépense déclarée</p>}
          <div className="space-y-2">
            {expenses.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_110px_auto] gap-2">
                <Input value={e.label} placeholder="Libellé" onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />
                <Select value={e.category} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, category: ev.target.value } : x)))}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input type="number" min={0} value={e.amount || ''} placeholder="Montant" onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, amount: Number(ev.target.value) } : x)))} />
                <Button variant="ghost" size="icon" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className={cn('mt-6 grid grid-cols-3 gap-3 rounded-xl border p-4', outTol ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
          <div>
            <p className="text-[11px] text-muted-foreground">Déclaré + dépenses</p>
            <p className="font-semibold tabular">{formatMoney((Number(declared) || 0) + expTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Écart de caisse</p>
            <p className={cn('font-semibold tabular', v.variance < 0 ? 'text-red-600' : '')}>{formatMoney(v.variance)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Écart %</p>
            <p className={cn('font-semibold tabular', outTol && 'text-red-600')}>
              {formatPct(v.variance_pct)} {outTol && <AlertTriangle className="inline size-3.5" />}
            </p>
          </div>
          {outTol && <p className="col-span-3 text-[11px] text-red-700">Écart supérieur à la tolérance de {CASH_VARIANCE_TOLERANCE} % : une alerte sera envoyée à l’administration.</p>}
        </div>

        <Field label="Commentaires" className="mt-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explication d’un écart, incident…" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!storeId}>
            Enregistrer le brouillon
          </Button>
          <Button onClick={() => submit.mutate(undefined)} loading={submit.isPending} disabled={!storeId || declared === ''}>
            <Send /> Envoyer pour validation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReportDetail({ report: r, onClose, onEdit }: { report: DailyReport; onClose: () => void; onEdit: () => void }) {
  const user = useAuth((s) => s.user)!
  const L = useLookups()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const validate = useAction(() => api.validateDailyReport(r.id), { tables: ['daily_reports', 'notifications'], success: 'Déclaration validée', onSuccess: onClose })
  const reject = useAction(() => api.rejectDailyReport(r.id, reason), { tables: ['daily_reports', 'notifications'], success: 'Déclaration rejetée', onSuccess: onClose })
  const submit = useAction(() => api.submitDailyReport(r.id), { tables: ['daily_reports', 'notifications'], success: 'Déclaration envoyée', onSuccess: onClose })
  const canValidate = r.status === 'submitted' && can(user.role, 'reports.daily.validate') && inScope(user, r.store_id)
  const canEdit = ['draft', 'rejected'].includes(r.status) && can(user.role, 'reports.daily.edit') && inScope(user, r.store_id)
  const author = L.user.get(r.user_id)
  const validator = r.validated_by ? L.user.get(r.validated_by) : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" title={`Déclaration du ${formatDate(r.report_date, 'dd MMMM yyyy')}`} description={L.store.get(r.store_id)?.name}>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <ReportStatusBadge status={r.status} />
          {author && (
            <span>
              Saisie par {author.first_name} {author.last_name}
            </span>
          )}
          {validator && r.validated_at && (
            <span>
              · {r.status === 'validated' ? 'Validée' : 'Traitée'} par {validator.first_name} {validator.last_name} le {formatDateTime(r.validated_at)}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Théorique POS', formatMoney(r.theoretical_amount)],
            ['Déclaré', formatMoney(r.declared_amount)],
            ['Dépenses', formatMoney(r.expenses_total)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border p-3">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="mt-0.5 font-semibold tabular">{v}</p>
            </div>
          ))}
          <div className="rounded-xl border p-3">
            <p className="text-[11px] text-muted-foreground">Écart</p>
            <VarianceCell r={r} />
          </div>
        </div>
        {r.expenses.length > 0 && (
          <div className="mt-5 divide-y rounded-xl border text-sm">
            {r.expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <span>
                  {e.label} <span className="text-xs text-muted-foreground">· {e.category}</span>
                </span>
                <span className="tabular">{formatMoney(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {r.notes && <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs">{r.notes}</p>}
        {r.rejection_reason && (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700">
            <b>Motif du rejet :</b> {r.rejection_reason}
          </p>
        )}
        {rejecting && (
          <Field label="Motif du rejet *" className="mt-4">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Précisez la correction attendue…" />
          </Field>
        )}
        {(canValidate || canEdit) && (
          <DialogFooter>
            {canEdit && (
              <>
                <Button variant="outline" onClick={onEdit}>
                  Modifier
                </Button>
                <Button onClick={() => submit.mutate(undefined)} loading={submit.isPending}>
                  <Send /> Envoyer
                </Button>
              </>
            )}
            {canValidate &&
              (rejecting ? (
                <>
                  <Button variant="outline" onClick={() => setRejecting(false)}>
                    Annuler
                  </Button>
                  <Button variant="destructive" onClick={() => reject.mutate(undefined)} disabled={!reason.trim()} loading={reject.isPending}>
                    Confirmer le rejet
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    <X /> Rejeter
                  </Button>
                  <Button variant="success" onClick={() => validate.mutate(undefined)} loading={validate.isPending}>
                    <Check /> Valider
                  </Button>
                </>
              ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
