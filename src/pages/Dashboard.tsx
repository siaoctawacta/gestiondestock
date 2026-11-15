import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays } from 'date-fns'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Boxes,
  PackageX,
  Percent,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StatCard } from '@/components/common/StatCard'
import { BarList, DonutChart, RevenueAreaChart, SimpleBarChart } from '@/components/common/charts'
import { StockBadge, TransferStatusBadge } from '@/components/common/badges'
import { ProductThumb } from '@/components/common/ProductThumb'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { useAuth } from '@/store/auth'
import { useInventory, useLookups, useSales, useTransfers } from '@/hooks/queries'
import {
  byPaymentMethod,
  dailySeries,
  delta,
  effectiveMin,
  hourlySeries,
  inRange,
  stockStats,
  storeRanking,
  summarize,
  topProducts,
} from '@/lib/analytics'
import { formatCompact, formatDateTime, formatMoney, formatNumber, formatPct, timeAgo } from '@/lib/utils'
import { ROLE_LABELS, storeScope } from '@/lib/permissions'
import { PAYMENT_LABELS } from '@/components/common/badges'
import type { Sale } from '@/types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'
}

function useDashboardData() {
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const sales = useSales({ from: subDays(new Date(), 120).toISOString().slice(0, 10) })
  const inventory = useInventory()
  const filter = <T extends { store_id: string }>(rows: T[]) =>
    activeStoreId ? rows.filter((r) => r.store_id === activeStoreId) : rows
  return {
    loading: sales.isLoading || inventory.isLoading,
    sales: filter(sales.data ?? []),
    inventory: filter(inventory.data ?? []),
    activeStoreId,
  }
}

function RecentSales({ sales, showCashier = true }: { sales: Sale[]; showCashier?: boolean }) {
  const L = useLookups()
  if (!sales.length) return <EmptyState icon={Receipt} title="Aucune vente" description="Les ventes apparaîtront ici en temps réel." />
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Ticket</TH>
          <TH className="hidden md:table-cell">Boutique</TH>
          {showCashier && <TH className="hidden lg:table-cell">Caissier</TH>}
          <TH className="hidden sm:table-cell">Paiement</TH>
          <TH className="text-right">Montant</TH>
        </TR>
      </THead>
      <TBody>
        {sales.slice(0, 7).map((s) => {
          const u = L.user.get(s.cashier_id)
          return (
            <TR key={s.id}>
              <TD>
                <p className="font-medium tabular">{s.reference}</p>
                <p className="text-[11px] text-muted-foreground">{timeAgo(s.created_at)}</p>
              </TD>
              <TD className="hidden text-muted-foreground md:table-cell">{L.store.get(s.store_id)?.name}</TD>
              {showCashier && (
                <TD className="hidden lg:table-cell">
                  {u ? (
                    <span className="flex items-center gap-2">
                      <Avatar first={u.first_name} last={u.last_name} className="size-6 text-[10px]" />
                      {u.first_name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
              )}
              <TD className="hidden text-muted-foreground sm:table-cell">{PAYMENT_LABELS[s.payments[0]?.method ?? 'cash']}</TD>
              <TD className="text-right font-semibold tabular">{formatMoney(s.total)}</TD>
            </TR>
          )
        })}
      </TBody>
    </Table>
  )
}

function StockAlerts({ limit = 6 }: { limit?: number }) {
  const { inventory } = useDashboardData()
  const L = useLookups()
  const alerts = inventory
    .map((i) => ({ i, p: L.product.get(i.product_id) }))
    .filter(({ i, p }) => p && i.quantity <= effectiveMin(i, p))
    .sort((a, b) => a.i.quantity - b.i.quantity)
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Alertes de réapprovisionnement</CardTitle>
          <CardDescription>{alerts.length} référence(s) sous le seuil minimum</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory?filter=alert">
            Tout voir <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {alerts.slice(0, limit).map(({ i, p }) => (
          <div key={i.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
            <ProductThumb product={p!} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{p!.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{L.store.get(i.store_id)?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular">{i.quantity}</p>
              <StockBadge quantity={i.quantity} min={effectiveMin(i, p)} />
            </div>
          </div>
        ))}
        {!alerts.length && <EmptyState icon={Boxes} title="Aucune alerte" description="Tous les stocks sont au-dessus du seuil." />}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function ExecutiveDashboard() {
  const { sales, inventory, loading, activeStoreId } = useDashboardData()
  const L = useLookups()
  const user = useAuth((s) => s.user)
  const [range, setRange] = useState('30')
  const days = Number(range)
  const now = new Date()

  const current = useMemo(() => inRange(sales, subDays(now, days - 1), now), [sales, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(
    () => inRange(sales, subDays(now, days * 2 - 1), subDays(now, days)),
    [sales, days], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const k = summarize(current)
  const kp = summarize(previous)
  const stock = stockStats(inventory, L.product)
  const series = dailySeries(sales, days)
  const top = topProducts(current, 10)
  const scope = storeScope(user)
  const stores = [...L.store.values()].filter((s) => scope === null || scope.includes(s.id))
  const ranking = storeRanking(current, stores)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chiffre d’affaires TTC" value={formatMoney(k.revenue)} icon={Wallet} delta={delta(k.revenue, kp.revenue)} hint={`vs ${days} j précédents`} loading={loading} />
        <StatCard label="Marge brute (HT)" value={formatMoney(k.margin)} icon={TrendingUp} delta={delta(k.margin, kp.margin)} hint={`Taux ${formatPct(k.marginRate)}`} loading={loading} tone="success" />
        <StatCard label="Valeur du stock (PA HT)" value={formatMoney(stock.valueHT)} icon={Boxes} hint={`${formatNumber(stock.units)} unités · ${stock.out} rupture(s)`} loading={loading} tone="warning" />
        <StatCard label="Transactions" value={formatNumber(k.count)} icon={Receipt} delta={delta(k.count, kp.count)} hint={`Panier moyen ${formatMoney(k.basket)}`} loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Évolution du chiffre d’affaires</CardTitle>
              <CardDescription>
                {activeStoreId ? L.store.get(activeStoreId)?.name : 'Réseau consolidé'} · TTC
              </CardDescription>
            </div>
            <Tabs value={range} onValueChange={setRange}>
              <TabsList>
                <TabsTrigger value="7">7 j</TabsTrigger>
                <TabsTrigger value="30">30 j</TabsTrigger>
                <TabsTrigger value="60">60 j</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Modes de paiement</CardTitle>
              <CardDescription>Répartition des encaissements</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DonutChart data={byPaymentMethod(current)} />
            <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-xs">
              <div>
                <p className="text-muted-foreground">Remises accordées</p>
                <p className="mt-0.5 font-semibold tabular">{formatMoney(k.discounts)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">TVA collectée</p>
                <p className="mt-0.5 font-semibold tabular">{formatMoney(k.tax)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top 10 produits</CardTitle>
              <CardDescription>Par chiffre d’affaires sur {days} jours</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarList
              items={top.map((t) => ({ key: t.product_id, label: t.name, value: t.revenue, sub: `${t.quantity} u.` }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Palmarès des boutiques</CardTitle>
              <CardDescription>Performance sur {days} jours</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>#</TH>
                <TH>Boutique</TH>
                <TH className="text-right">CA TTC</TH>
                <TH className="hidden text-right sm:table-cell">Marge</TH>
                <TH className="hidden text-right md:table-cell">Panier</TH>
              </TR>
            </THead>
            <TBody>
              {ranking.map((r, i) => (
                <TR key={r.store.id}>
                  <TD className="w-10">
                    <span className={i === 0 ? 'grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white' : 'pl-2 text-muted-foreground'}>
                      {i + 1}
                    </span>
                  </TD>
                  <TD>
                    <p className="font-medium">{r.store.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.count} ventes</p>
                  </TD>
                  <TD className="text-right font-semibold tabular">{formatCompact(r.revenue)}</TD>
                  <TD className="hidden text-right tabular text-muted-foreground sm:table-cell">{formatPct(r.marginRate)}</TD>
                  <TD className="hidden text-right tabular text-muted-foreground md:table-cell">{formatMoney(r.basket)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Ventes récentes</CardTitle>
              <CardDescription>Mises à jour en temps réel</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sales">
                Historique <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <RecentSales sales={sales} />
        </Card>
        <StockAlerts />
      </div>
    </div>
  )
}

function StoreManagerDashboard() {
  const { sales, loading } = useDashboardData()
  const today = inRange(sales, new Date(), new Date())
  const yesterday = inRange(sales, subDays(new Date(), 1), subDays(new Date(), 1))
  const k = summarize(today)
  const ky = summarize(yesterday)
  const week = dailySeries(sales, 14)
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CA du jour" value={formatMoney(k.revenue)} icon={Wallet} delta={delta(k.revenue, ky.revenue)} hint="vs hier" loading={loading} />
        <StatCard label="Transactions du jour" value={formatNumber(k.count)} icon={Receipt} delta={delta(k.count, ky.count)} hint="vs hier" loading={loading} />
        <StatCard label="Panier moyen" value={formatMoney(k.basket)} icon={ShoppingBag} loading={loading} tone="success" />
        <StatCard label="Marge du jour" value={formatMoney(k.margin)} icon={Percent} hint={formatPct(k.marginRate)} loading={loading} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Chiffre d’affaires — 14 derniers jours</CardTitle>
              <CardDescription>Boutique</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={week} height={260} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Affluence du jour</CardTitle>
              <CardDescription>Nombre de tickets par heure</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={hourlySeries(today)} xKey="hour" dataKey="count" name="Tickets" money={false} height={260} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Ventes récentes de l’équipe</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sales">
                Tout voir <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <RecentSales sales={sales} />
        </Card>
        <StockAlerts />
      </div>
    </div>
  )
}

function CashierDashboard() {
  const { sales, loading } = useDashboardData()
  const today = inRange(sales, new Date(), new Date())
  const k = summarize(today)
  const pm = byPaymentMethod(today)
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-start justify-between gap-4 bg-gradient-to-r from-primary to-rose-700 p-6 text-white sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-white/80">Prêt à encaisser ?</p>
            <p className="mt-1 text-xl font-semibold">Ouvrez le terminal de caisse</p>
          </div>
          <Button asChild size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">
            <Link to="/pos">
              <ShoppingCart /> Caisse POS
            </Link>
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Mon CA du jour" value={formatMoney(k.revenue)} icon={Wallet} loading={loading} />
        <StatCard label="Mes transactions" value={formatNumber(k.count)} icon={Receipt} loading={loading} tone="success" />
        <StatCard label="Panier moyen" value={formatMoney(k.basket)} icon={ShoppingBag} loading={loading} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Mes dernières ventes</CardTitle>
          </CardHeader>
          <RecentSales sales={sales} showCashier={false} />
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Encaissements du jour</CardTitle>
              <CardDescription>Par mode de paiement</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pm.map((p) => (
              <div key={p.key} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Banknote className="size-4" /> {p.name}
                </span>
                <span className="font-semibold tabular">{formatMoney(p.value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StockManagerDashboard() {
  const { inventory, loading } = useDashboardData()
  const L = useLookups()
  const transfers = useTransfers().data ?? []
  const stock = stockStats(inventory, L.product)
  const transit = transfers.filter((t) => t.status === 'in_transit')
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Valeur du stock (PA HT)" value={formatMoney(stock.valueHT)} icon={Boxes} hint={`${formatNumber(stock.units)} unités`} loading={loading} />
        <StatCard label="Ruptures" value={String(stock.out)} icon={PackageX} tone="danger" hint="références à 0" loading={loading} />
        <StatCard label="Stocks faibles" value={String(stock.low)} icon={AlertTriangle} tone="warning" hint="sous le seuil" loading={loading} />
        <StatCard label="Transferts en transit" value={String(transit.length)} icon={ArrowLeftRight} tone="success" loading={loading} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Transferts en cours</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/transfers">
                Gérer <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          {transit.length ? (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Référence</TH>
                  <TH>Trajet</TH>
                  <TH className="text-right">Articles</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {transit.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <p className="font-medium tabular">{t.reference}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(t.created_at)}</p>
                    </TD>
                    <TD className="text-muted-foreground">
                      {L.store.get(t.source_store_id)?.name} → {L.store.get(t.dest_store_id)?.name}
                    </TD>
                    <TD className="text-right tabular">{t.items.reduce((a, i) => a + i.quantity, 0)}</TD>
                    <TD>
                      <TransferStatusBadge status={t.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={ArrowLeftRight} title="Aucun transfert en transit" />
          )}
        </Card>
        <StockAlerts limit={8} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const user = useAuth((s) => s.user)!
  const role = user.role
  return (
    <div>
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{ROLE_LABELS[role]}</p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {greeting()}, {user.first_name}
        </h1>
      </div>
      {role === 'cashier' ? (
        <CashierDashboard />
      ) : role === 'store_manager' ? (
        <StoreManagerDashboard />
      ) : role === 'stock_manager' ? (
        <StockManagerDashboard />
      ) : (
        <ExecutiveDashboard />
      )}
    </div>
  )
}
