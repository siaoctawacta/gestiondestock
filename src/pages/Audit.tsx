import { Card } from '@/components/ui/card'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable } from '@/components/common/DataTable'
import { ExportMenu } from '@/components/common/ExportMenu'
import { useAuditLogs, useLookups } from '@/hooks/queries'
import { formatDateTime } from '@/lib/utils'
import { exportExcel, exportPdf } from '@/lib/export'
import type { AuditLog } from '@/types'

const VARIANT: Record<string, BadgeVariant> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  DISABLE: 'danger',
  REJECT: 'danger',
  VALIDATE: 'success',
  ADJUST: 'warning',
  DISCOUNT: 'warning',
  LOGIN: 'neutral',
}

export default function Audit() {
  const logs = useAuditLogs()
  const L = useLookups()
  const name = (id: string | null) => {
    const u = id ? L.user.get(id) : null
    return u ? `${u.first_name} ${u.last_name}` : 'Système'
  }
  const cols = [
    { header: 'Date', value: (l: AuditLog) => formatDateTime(l.created_at) },
    { header: 'Utilisateur', value: (l: AuditLog) => name(l.user_id) },
    { header: 'Action', value: (l: AuditLog) => l.action },
    { header: 'Entité', value: (l: AuditLog) => l.entity },
    { header: 'Détail', value: (l: AuditLog) => l.details ?? '' },
  ]
  return (
    <div>
      <PageHeader
        title="Journal d’audit"
        description="Traçabilité des actions critiques (triggers PostgreSQL) — lecture seule"
        actions={
          <ExportMenu
            onPdf={() => exportPdf('Journal d’audit', [{ name: 'Audit', columns: cols, rows: logs.data ?? [] }])}
            onExcel={() => exportExcel('Journal audit', [{ name: 'Audit', columns: cols, rows: logs.data ?? [] }])}
          />
        }
      />
      <Card>
        <DataTable
          data={logs.data ?? []}
          loading={logs.isLoading}
          rowKey={(l) => l.id}
          pageSize={20}
          search={(l) => `${name(l.user_id)} ${l.action} ${l.entity} ${l.details ?? ''}`}
          columns={[
            { key: 'date', header: 'Date', sort: (l) => l.created_at, cell: (l) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span> },
            { key: 'user', header: 'Utilisateur', cell: (l) => <span className="font-medium">{name(l.user_id)}</span> },
            { key: 'action', header: 'Action', cell: (l) => <Badge variant={VARIANT[l.action] ?? 'neutral'}>{l.action}</Badge> },
            { key: 'entity', header: 'Entité', cell: (l) => <span className="font-mono text-xs">{l.entity}</span> },
            { key: 'details', header: 'Détail', cell: (l) => <span className="text-xs text-muted-foreground">{l.details}</span> },
          ]}
          initialSort={{ key: 'date', dir: 'desc' }}
        />
      </Card>
    </div>
  )
}
