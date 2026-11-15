import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Printer, Receipt, ShoppingBag, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { StatCard } from '@/components/common/StatCard'
import { ExportMenu } from '@/components/common/ExportMenu'
import { PAYMENT_LABELS, PROVIDER_LABELS } from '@/components/common/badges'
import { useLookups, useSales } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { summarize } from '@/lib/analytics'
import { exportExcel, exportPdf, pdfMoney } from '@/lib/export'
import { generateReceiptPdf } from '@/lib/receipt'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils'
import type { Sale } from '@/types'

export default function Sales() {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [method, setMethod] = useState('')
  const [selected, setSelected] = useState<Sale | null>(null)
  const L = useLookups()
  const q = useSales({ from, to, store_id: activeStoreId ?? undefined })
  const sales = useMemo(
    () => (q.data ?? []).filter((s) => !method || s.payments.some((p) => p.method === method)),
    [q.data, method],
  )
  const k = summarize(sales)
  const cashierName = (id: string) => {
    const u = L.user.get(id)
    return u ? `${u.first_name} ${u.last_name}` : id === user.id ? `${user.first_name} ${user.last_name}` : '—'
  }
  const columns = [
    { header: 'Ticket', value: (s: Sale) => s.reference },
    { header: 'Date', value: (s: Sale) => formatDateTime(s.created_at) },
    { header: 'Boutique', value: (s: Sale) => L.store.get(s.store_id)?.name ?? '' },
    { header: 'Caissier', value: (s: Sale) => cashierName(s.cashier_id) },
    { header: 'Articles', value: (s: Sale) => s.items.reduce((a, i) => a + i.quantity, 0), numeric: true },
    { header: 'Paiement', value: (s: Sale) => s.payments.map((p) => PAYMENT_LABELS[p.method]).join(', ') },
    { header: 'Remise', value: (s: Sale) => pdfMoney(s.discount_amount), numeric: true },
    { header: 'Total TTC', value: (s: Sale) => pdfMoney(s.total), numeric: true },
  ]

  return (
    <div>
      <PageHeader
        title="Historique des ventes"
        description={user.role === 'cashier' ? 'Vos transactions encaissées' : 'Toutes les transactions de votre périmètre'}
        actions={
          <ExportMenu
            onPdf={() =>
              exportPdf('Journal des ventes', [{ name: 'Ventes', columns, rows: sales }], {
                subtitle: `Du ${from} au ${to}`,
                summary: [
                  ['CA TTC', pdfMoney(k.revenue)],
                  ['Transactions', String(k.count)],
                  ['Panier moyen', pdfMoney(k.basket)],
                  ['Remises', pdfMoney(k.discounts)],
                ],
              })
            }
            onExcel={() =>
              exportExcel('Journal des ventes', [
                {
                  name: 'Ventes',
                  columns: columns.map((c) =>
                    c.header === 'Total TTC'
                      ? { ...c, value: (s: Sale) => s.total }
                      : c.header === 'Remise'
                        ? { ...c, value: (s: Sale) => s.discount_amount }
                        : c,
                  ),
                  rows: sales,
                },
                {
                  name: 'Lignes',
                  columns: [
                    { header: 'Ticket', value: (r: { s: Sale; i: Sale['items'][number] }) => r.s.reference },
                    { header: 'Produit', value: (r) => r.i.product_name },
                    { header: 'Qté', value: (r) => r.i.quantity },
                    { header: 'PU TTC', value: (r) => r.i.unit_price },
                    { header: 'Total', value: (r) => r.i.line_total },
                  ],
                  rows: sales.flatMap((s) => s.items.map((i) => ({ s, i }))),
                },
              ])
            }
          />
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="CA TTC de la période" value={formatMoney(k.revenue)} icon={Wallet} loading={q.isLoading} />
        <StatCard label="Transactions" value={formatNumber(k.count)} icon={Receipt} hint={`${formatNumber(k.units)} articles`} loading={q.isLoading} tone="success" />
        <StatCard label="Panier moyen" value={formatMoney(k.basket)} icon={ShoppingBag} loading={q.isLoading} />
      </div>
      <Card>
        <DataTable
          data={sales}
          loading={q.isLoading}
          rowKey={(s) => s.id}
          onRowClick={setSelected}
          search={(s) => `${s.reference} ${s.items.map((i) => i.product_name).join(' ')} ${cashierName(s.cashier_id)}`}
          searchPlaceholder="Ticket, produit, caissier…"
          toolbar={
            <>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
              <span className="text-xs text-muted-foreground">→</span>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-auto" />
              <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-40">
                <option value="">Tous paiements</option>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </>
          }
          columns={[
            {
              key: 'ref',
              header: 'Ticket',
              cell: (s) => (
                <div>
                  <p className="font-medium tabular">{s.reference}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(s.created_at)}</p>
                </div>
              ),
              sort: (s) => s.created_at,
            },
            { key: 'store', header: 'Boutique', cell: (s) => <span className="text-muted-foreground">{L.store.get(s.store_id)?.name}</span> },
            { key: 'cashier', header: 'Caissier', cell: (s) => cashierName(s.cashier_id) },
            { key: 'items', header: 'Articles', cell: (s) => <span className="tabular">{s.items.reduce((a, i) => a + i.quantity, 0)}</span> },
            {
              key: 'pay',
              header: 'Paiement',
              cell: (s) => (
                <Badge variant="neutral">
                  {s.payments.map((p) => (p.provider ? PROVIDER_LABELS[p.provider] : PAYMENT_LABELS[p.method])).join(' + ')}
                </Badge>
              ),
            },
            {
              key: 'total',
              header: 'Total',
              headerClassName: 'text-right',
              className: 'text-right',
              cell: (s) => (
                <div>
                  <p className="font-semibold tabular">{formatMoney(s.total)}</p>
                  {s.discount_amount > 0 && <p className="text-[11px] text-primary tabular">−{formatMoney(s.discount_amount)}</p>}
                </div>
              ),
              sort: (s) => s.total,
            },
          ]}
          initialSort={{ key: 'ref', dir: 'desc' }}
          emptyTitle="Aucune vente sur la période"
        />
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        {selected && (
          <DialogContent title={`Ticket ${selected.reference}`} description={`${formatDateTime(selected.created_at)} · ${L.store.get(selected.store_id)?.name}`}>
            <div className="space-y-2 text-sm">
              {selected.items.map((i) => (
                <div key={i.product_id} className="flex justify-between gap-3">
                  <span>
                    <span className="text-muted-foreground tabular">{i.quantity} ×</span> {i.product_name}
                  </span>
                  <span className="tabular">{formatMoney(i.line_total)}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Sous-total</dt>
                <dd className="tabular">{formatMoney(selected.subtotal)}</dd>
              </div>
              {selected.discount_amount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Remise</dt>
                  <dd className="tabular">−{formatMoney(selected.discount_amount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <dt>dont TVA</dt>
                <dd className="tabular">{formatMoney(selected.tax_amount)}</dd>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold">
                <dt>Total TTC</dt>
                <dd className="tabular">{formatMoney(selected.total)}</dd>
              </div>
              {selected.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                  <dt>
                    {PAYMENT_LABELS[p.method]}
                    {p.provider && ` · ${PROVIDER_LABELS[p.provider]}`}
                  </dt>
                  <dd className="tabular">
                    {p.amount_received !== null ? `Reçu ${formatMoney(p.amount_received)} · Rendu ${formatMoney(p.change_given ?? 0)}` : formatMoney(p.amount)}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              variant="outline"
              className="mt-5 w-full"
              onClick={() => {
                const u = L.user.get(selected.cashier_id) ?? (selected.cashier_id === user.id ? user : undefined)
                void generateReceiptPdf(selected, L.store.get(selected.store_id), u)
              }}
            >
              <Printer /> Réimprimer le ticket
            </Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
