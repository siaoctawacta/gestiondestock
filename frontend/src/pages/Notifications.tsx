import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff, CheckCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { NotificationIcon } from '@/components/layout/Topbar'
import { useAction, useNotifications } from '@/hooks/queries'
import { api } from '@/data'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

const LINK: Record<string, string> = {
  low_stock: '/inventory?filter=alert',
  out_of_stock: '/inventory?filter=out',
  daily_report: '/daily-reports',
  cash_variance: '/daily-reports',
  report_status: '/daily-reports',
  transfer: '/transfers',
}

export default function Notifications() {
  const navigate = useNavigate()
  const list = useNotifications()
  const [filter, setFilter] = useState('all')
  const markAll = useAction(() => api.markAllNotificationsRead(), { tables: ['notifications'], success: 'Tout est lu' })
  const markOne = useAction((id: string) => api.markNotificationRead(id), { tables: ['notifications'] })
  const rows = (list.data ?? []).filter((n) =>
    filter === 'all' ? true : filter === 'unread' ? !n.read : filter === 'stock' ? ['low_stock', 'out_of_stock'].includes(n.type) : ['daily_report', 'cash_variance', 'report_status'].includes(n.type),
  )
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Alertes stock, déclarations et écarts de caisse"
        actions={
          <Button variant="outline" onClick={() => markAll.mutate(undefined)}>
            <CheckCheck /> Tout marquer comme lu
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="unread">Non lues</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="cash">Caisse</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="divide-y">
        {rows.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              if (!n.read) markOne.mutate(n.id)
              navigate(LINK[n.type] ?? '/')
            }}
            className={cn('flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-muted/40', !n.read && 'bg-accent/40')}
          >
            <NotificationIcon n={n} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={formatDateTime(n.created_at)}>
                  {timeAgo(n.created_at)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
            </div>
            {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
          </button>
        ))}
        {!rows.length && <EmptyState icon={BellOff} title="Aucune notification" />}
      </Card>
    </div>
  )
}
