import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Boxes, Percent, Receipt, TrendingUp, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { ExportMenu } from '@/components/common/ExportMenu'
import { BarList, RevenueAreaChart, SimpleBarChart } from '@/components/common/charts'
import { Avatar } from '@/components/common/Avatar'
import { useCategories, useInventory, useLookups, useSales } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { storeScope } from '@/lib/permissions'
import {
  byCashier,
  byCategory,
  dailySeries,
  stockRotation,
  stockStats,
  storeRanking,
  summarize,
  topProducts,
} from '@/lib/analytics'
import { exportExcel, exportPdf, pdfMoney, type ExportSheet } from '@/lib/export'
import { formatCompact, formatMoney, formatNumber, formatPct } from '@/lib/utils'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const PRESETS = [
  ['7 j', 7],
  ['30 j', 30],
  ['90 j', 90],
] as const

export default function Reports() {
  const user = useAuth((s) => s.user)!
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [tab, setTab] = useState('sales')
  const q = useSales({ from, to, store_id: activeStoreId ?? undefined })
  const inventoryQ = useInventory()
  const categories = useCategories().data ?? []
  const L = useLookups()
  const sales = useMemo(() => (q.data ?? []).filter((s) => s.status === 'completed'), [q.data])
  const inventory = (inventoryQ.data ?? []).filter((i) => !activeStoreId || i.store_id === activeStoreId)
  const days = Math.max(1, differenceInCalendarDays(parseISO(to), parseISO(from)) + 1)
  const scope = storeScope(user)
  const stores = [...L.store.values()].filter((s) => (scope === null || scope.includes(s.id)) && (!activeStoreId || s.id === activeStoreId))

  const k = summarize(sales)
  const series = dailySeries(sales, days, parseISO(to))
  const cats = byCategory(sales, L.product, categories)
  const ranking = storeRanking(sales, stores)
  const top = topProducts(sales, 1000)
  const cashiers = byCashier(sales)
  const stock = stockStats(inventory, L.product)
  const rotation = stockRotation(sales, inventory, L.product, days)
  const period = `Période du ${format(parseISO(from), 'dd/MM/yyyy')} au ${format(parseISO(to), 'dd/MM/yyyy')}${activeStoreId ? ` · ${L.store.get(activeStoreId)?.name}` : ''}`
  const userName = (id: string) => {
    const u = L.user.get(id)
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  // ---- Définition des exports par onglet
  type Def = { title: string; sheets: ExportSheet<any>[]; summary: [string, string][] } // eslint-disable-line @typescript-eslint/no-explicit-any
  const defs: Record<string, Def> = {
    sales: {
      title: 'Rapport des ventes',
      summary: [
        ['CA TTC', pdfMoney(k.revenue)],
        ['CA HT', pdfMoney(k.revenueHT)],
        ['Transactions', formatNumber(k.count)],
        ['Panier moyen', pdfMoney(k.basket)],
      ],
      sheets: [
        {
          name: 'Par jour',
          rows: series,
          columns: [
            { header: 'Date', value: (r: (typeof series)[number]) => r.date },
            { header: 'Transactions', value: (r: (typeof series)[number]) => r.count, numeric: true },
            { header: 'CA TTC', value: (r: (typeof series)[number]) => pdfMoney(r.revenue), numeric: true },
          ],
        },
        {
          name: 'Par boutique',
          rows: ranking,
          columns: [
            { header: 'Boutique', value: (r: (typeof ranking)[number]) => r.store.name },
            { header: 'Transactions', value: (r: (typeof ranking)[number]) => r.count, numeric: true },
            { header: 'CA TTC', value: (r: (typeof ranking)[number]) => pdfMoney(r.revenue), numeric: true },
            { header: 'Panier moyen', value: (r: (typeof ranking)[number]) => pdfMoney(r.basket), numeric: true },
          ],
        },
        {
          name: 'Par catégorie',
          rows: cats,
          columns: [
            { header: 'Catégorie', value: (r: (typeof cats)[number]) => r.name },
            { header: 'CA TTC', value: (r: (typeof cats)[number]) => pdfMoney(r.value), numeric: true },
            { header: 'Part', value: (r: (typeof cats)[number]) => formatPct((r.value / (k.revenue || 1)) * 100), numeric: true },
          ],
        },
      ],
    },
    stock: {
      title: 'Rapport de stock',
      summary: [
        ['Valeur PA HT', pdfMoney(stock.valueHT)],
        ['Valeur vente TTC', pdfMoney(stock.retailValue)],
        ['Unités', formatNumber(stock.units)],
        ['Ruptures', String(stock.out)],
      ],
      sheets: [
        {
          name: 'Rotation',
          rows: rotation,
          columns: [
            { header: 'SKU', value: (r: (typeof rotation)[number]) => r.product.sku },
            { header: 'Produit', value: (r: (typeof rotation)[number]) => r.product.name },
            { header: 'Vendus', value: (r: (typeof rotation)[number]) => r.sold, numeric: true },
            { header: 'Stock', value: (r: (typeof rotation)[number]) => r.stock, numeric: true },
            { header: 'Rotation', value: (r: (typeof rotation)[number]) => (Number.isFinite(r.rotation) ? r.rotation.toFixed(2) : '∞'), numeric: true },
            { header: 'Couverture (j)', value: (r: (typeof rotation)[number]) => r.coverDays ?? '—', numeric: true },
            { header: 'Valeur PA HT', value: (r: (typeof rotation)[number]) => pdfMoney(r.value), numeric: true },
          ],
        },
      ],
    },
    margin: {
      title: 'Rapport de marge & bénéfices',
      summary: [
        ['CA HT', pdfMoney(k.revenueHT)],
        ['Marge brute', pdfMoney(k.margin)],
        ['Taux de marge', formatPct(k.marginRate)],
        ['Remises', pdfMoney(k.discounts)],
      ],
      sheets: [
        {
          name: 'Marge par produit',
          rows: top,
          columns: [
            { header: 'Produit', value: (r: (typeof top)[number]) => r.name },
            { header: 'Qté', value: (r: (typeof top)[number]) => r.quantity, numeric: true },
            { header: 'CA TTC', value: (r: (typeof top)[number]) => pdfMoney(r.revenue), numeric: true },
            { header: 'Marge HT', value: (r: (typeof top)[number]) => pdfMoney(r.margin), numeric: true },
          ],
        },
      ],
    },
    staff: {
      title: 'Performance des employés',
      summary: [
        ['Vendeurs actifs', String(cashiers.length)],
        ['CA TTC', pdfMoney(k.revenue)],
        ['Transactions', formatNumber(k.count)],
        ['Panier moyen', pdfMoney(k.basket)],
      ],
      sheets: [
        {
          name: 'Caissiers',
          rows: cashiers,
          columns: [
            { header: 'Caissier', value: (r: (typeof cashiers)[number]) => userName(r.cashier_id) },
            { header: 'Transactions', value: (r: (typeof cashiers)[number]) => r.count, numeric: true },
            { header: 'Articles', value: (r: (typeof cashiers)[number]) => r.units, numeric: true },
            { header: 'CA TTC', value: (r: (typeof cashiers)[number]) => pdfMoney(r.revenue), numeric: true },
            { header: 'Panier moyen', value: (r: (typeof cashiers)[number]) => pdfMoney(r.revenue / r.count), numeric: true },
            { header: 'Remises', value: (r: (typeof cashiers)[number]) => pdfMoney(r.discounts), numeric: true },
          ],
        },
      ],
    },
  }
  const def = defs[tab]

  return (
    <div>
      <PageHeader
        title="Centre de reporting"
        description={period}
        actions={
          <ExportMenu
            onPdf={() => exportPdf(def.title, def.sheets, { subtitle: period, summary: def.summary })}
            onExcel={() => exportExcel(def.title, def.sheets)}
          />
        }
      />
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        {PRESETS.map(([label, n]) => (
          <button
            key={label}
            onClick={() => {
              setFrom(format(subDays(new Date(), n - 1), 'yyyy-MM-dd'))
              setTo(format(new Date(), 'yyyy-MM-dd'))
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === n && to === format(new Date(), 'yyyy-MM-dd') ? 'bg-primary text-white' : 'hover:bg-muted'}`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 h-10">
          <TabsTrigger value="sales" className="px-4 py-1.5"><Receipt /> Ventes</TabsTrigger>
          <TabsTrigger value="stock" className="px-4 py-1.5"><Boxes /> Stock</TabsTrigger>
          <TabsTrigger value="margin" className="px-4 py-1.5"><Percent /> Marges</TabsTrigger>
          <TabsTrigger value="staff" className="px-4 py-1.5"><Users /> Employés</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="CA TTC" value={formatMoney(k.revenue)} icon={Wallet} loading={q.isLoading} />
            <StatCard label="CA HT" value={formatMoney(k.revenueHT)} icon={TrendingUp} loading={q.isLoading} />
            <StatCard label="Transactions" value={formatNumber(k.count)} icon={Receipt} hint={`${formatNumber(k.units)} articles`} loading={q.isLoading} />
            <StatCard label="Panier moyen" value={formatMoney(k.basket)} icon={Wallet} loading={q.isLoading} tone="success" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Chiffre d’affaires journalier</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueAreaChart data={series} />
            </CardContent>
          </Card>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Par catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={cats.map((c) => ({ key: c.id, label: c.name, value: c.value, sub: formatPct((c.value / (k.revenue || 1)) * 100) }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Par boutique</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={ranking.map((r) => ({ name: r.store.name.replace('MMCG ', ''), revenue: Math.round(r.revenue) }))} xKey="name" dataKey="revenue" name="CA TTC" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Valeur stock PA HT" value={formatMoney(stock.valueHT)} icon={Boxes} />
            <StatCard label="Valeur vente TTC" value={formatMoney(stock.retailValue)} icon={Wallet} />
            <StatCard label="Unités" value={formatNumber(stock.units)} icon={Boxes} tone="success" />
            <StatCard label="Ruptures / faibles" value={`${stock.out} / ${stock.low}`} icon={Boxes} tone="danger" />
          </div>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Rotation des stocks</CardTitle>
                <CardDescription>Unités vendues sur la période ÷ stock actuel · couverture estimée en jours</CardDescription>
              </div>
            </CardHeader>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Produit</TH>
                  <TH className="text-right">Vendus</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Rotation</TH>
                  <TH className="text-right">Couverture</TH>
                  <TH className="hidden text-right md:table-cell">Valeur PA HT</TH>
                </TR>
              </THead>
              <TBody>
                {rotation.slice(0, 30).map((r) => (
                  <TR key={r.product.id}>
                    <TD className="font-medium">{r.product.name}</TD>
                    <TD className="text-right tabular">{r.sold}</TD>
                    <TD className="text-right tabular">{r.stock}</TD>
                    <TD className="text-right tabular">{Number.isFinite(r.rotation) ? r.rotation.toFixed(2) : '∞'}</TD>
                    <TD className={`text-right tabular ${r.coverDays !== null && r.coverDays < 7 ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>
                      {r.coverDays !== null ? `${r.coverDays} j` : '—'}
                    </TD>
                    <TD className="hidden text-right tabular text-muted-foreground md:table-cell">{formatMoney(r.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="margin" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="CA HT" value={formatMoney(k.revenueHT)} icon={Wallet} />
            <StatCard label="Marge brute" value={formatMoney(k.margin)} icon={TrendingUp} tone="success" />
            <StatCard label="Taux de marge" value={formatPct(k.marginRate)} icon={Percent} />
            <StatCard label="Remises accordées" value={formatMoney(k.discounts)} icon={Percent} tone="warning" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Marge brute journalière (HT)</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={series} xKey="label" dataKey="margin" name="Marge HT" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Produits les plus rentables</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={[...top]
                    .sort((a, b) => b.margin - a.margin)
                    .slice(0, 10)
                    .map((t) => ({ key: t.product_id, label: t.name, value: t.margin, sub: `${formatPct((t.margin / (t.revenue / 1.18 || 1)) * 100)}` }))}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Performance des caissiers</CardTitle>
                <CardDescription>Classement par chiffre d’affaires encaissé</CardDescription>
              </div>
            </CardHeader>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Caissier</TH>
                  <TH className="text-right">Transactions</TH>
                  <TH className="hidden text-right sm:table-cell">Articles</TH>
                  <TH className="text-right">CA TTC</TH>
                  <TH className="hidden text-right md:table-cell">Panier moyen</TH>
                  <TH className="hidden text-right md:table-cell">Remises</TH>
                  <TH className="hidden w-40 lg:table-cell">Part</TH>
                </TR>
              </THead>
              <TBody>
                {cashiers.map((c) => {
                  const u = L.user.get(c.cashier_id)
                  return (
                    <TR key={c.cashier_id}>
                      <TD>
                        <span className="flex items-center gap-2.5">
                          {u && <Avatar first={u.first_name} last={u.last_name} />}
                          <span>
                            <p className="font-medium">{userName(c.cashier_id)}</p>
                            <p className="text-[11px] text-muted-foreground">{u?.store_id ? L.store.get(u.store_id)?.name : ''}</p>
                          </span>
                        </span>
                      </TD>
                      <TD className="text-right tabular">{c.count}</TD>
                      <TD className="hidden text-right tabular sm:table-cell">{c.units}</TD>
                      <TD className="text-right font-semibold tabular">{formatCompact(c.revenue)}</TD>
                      <TD className="hidden text-right tabular md:table-cell">{formatMoney(c.revenue / c.count)}</TD>
                      <TD className="hidden text-right tabular text-muted-foreground md:table-cell">{formatMoney(c.discounts)}</TD>
                      <TD className="hidden lg:table-cell">
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/80" style={{ width: `${(c.revenue / (k.revenue || 1)) * 100}%` }} />
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
