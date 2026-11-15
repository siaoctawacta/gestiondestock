import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatPct } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  loading,
  tone = 'default',
}: {
  label: string
  value: string
  icon: LucideIcon
  delta?: number | null
  hint?: string
  loading?: boolean
  tone?: 'default' | 'warning' | 'danger' | 'success'
}) {
  const toneCls = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/10 text-amber-600',
    danger: 'bg-red-500/10 text-red-600',
    success: 'bg-emerald-500/10 text-emerald-600',
  }[tone]
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn('grid size-9 place-items-center rounded-lg', toneCls)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              delta >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {formatPct(Math.abs(delta))}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  )
}
