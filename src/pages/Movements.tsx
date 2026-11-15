import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ExportMenu } from '@/components/common/ExportMenu'
import { MOVEMENT_LABELS, MovementBadge } from '@/components/common/badges'
import { useLookups, useMovements } from '@/hooks/queries'
import { useAuth } from '@/store/auth'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { exportExcel, exportPdf } from '@/lib/export'
import type { StockMovement } from '@/types'

export default function Movements() {
  const activeStoreId = useAuth((s) => s.activeStoreId)
  const movements = useMovements()
  const L = useLookups()
  const [type, setType] = useState('')
  const rows = (movements.data ?? []).filter((m) => (!activeStoreId || m.store_id === activeStoreId) && (!type || m.type === type))
  const userName = (id: string) => {
    const u = L.user.get(id)
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }
  const cols = [
    { header: 'Date', value: (m: StockMovement) => formatDateTime(m.created_at) },
    { header: 'Type', value: (m: StockMovement) => MOVEMENT_LABELS[m.type] },
    { header: 'Produit', value: (m: StockMovement) => L.product.get(m.product_id)?.name ?? '' },
    { header: 'Boutique', value: (m: StockMovement) => L.store.get(m.store_id)?.name ?? '' },
    { header: 'Quantité', value: (m: StockMovement) => m.quantity, numeric: true },
    { header: 'Lot', value: (m: StockMovement) => m.lot_number ?? '' },
    { header: 'Péremption', value: (m: StockMovement) => m.expiry_date ?? '' },
    { header: 'Référence', value: (m: StockMovement) => m.reference ?? '' },
    { header: 'Motif', value: (m: StockMovement) => m.reason ?? '' },
  ]

  return (
    <div>
      <PageHeader
        title="Mouvements de stock"
        description="Journal d’audit inaltérable de toutes les entrées, sorties, ventes et transferts"
        actions={
          <ExportMenu
            onPdf={() => exportPdf('Journal des mouvements de stock', [{ name: 'Mouvements', columns: cols, rows: rows.slice(0, 1500) }])}
            onExcel={() => exportExcel('Mouvements de stock', [{ name: 'Mouvements', columns: cols, rows }])}
          />
        }
      />
      <Card>
        <DataTable
          data={rows}
          loading={movements.isLoading}
          rowKey={(m) => m.id}
          pageSize={20}
          search={(m) => `${L.product.get(m.product_id)?.name} ${m.reference ?? ''} ${m.lot_number ?? ''} ${m.reason ?? ''}`}
          searchPlaceholder="Produit, référence, lot…"
          toolbar={
            <>
              <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:flex">
                <Lock className="size-3" /> Lecture seule
              </span>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="w-48">
                <option value="">Tous les types</option>
                {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </>
          }
          columns={[
            { key: 'date', header: 'Date', sort: (m) => m.created_at, cell: (m) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span> },
            { key: 'type', header: 'Type', cell: (m) => <MovementBadge type={m.type} /> },
            { key: 'product', header: 'Produit', cell: (m) => <span className="font-medium">{L.product.get(m.product_id)?.name}</span> },
            { key: 'store', header: 'Boutique', cell: (m) => <span className="text-muted-foreground">{L.store.get(m.store_id)?.name}</span> },
            {
              key: 'qty',
              header: 'Qté',
              headerClassName: 'text-right',
              className: 'text-right',
              sort: (m) => m.quantity,
              cell: (m) => (
                <span className={cn('font-semibold tabular', m.quantity > 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {m.quantity > 0 ? '+' : ''}
                  {m.quantity}
                </span>
              ),
            },
            {
              key: 'detail',
              header: 'Détail',
              cell: (m) => (
                <div className="text-xs">
                  {m.reference && <p className="font-mono">{m.reference}</p>}
                  {m.lot_number && (
                    <p className="text-muted-foreground">
                      Lot {m.lot_number}
                      {m.expiry_date && ` · exp. ${formatDate(m.expiry_date)}`}
                    </p>
                  )}
                  {m.reason && <p className="text-muted-foreground">{m.reason}</p>}
                </div>
              ),
            },
            { key: 'user', header: 'Opérateur', cell: (m) => <span className="text-xs">{userName(m.user_id)}</span> },
          ]}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyTitle="Aucun mouvement"
        />
      </Card>
    </div>
  )
}
