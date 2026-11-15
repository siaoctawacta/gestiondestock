import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useUi } from '@/store/ui'
import { formatCompact, formatMoney } from '@/lib/utils'

/** Palette catégorielle validée (CVD) — ordre fixe, jamais recyclée. */
export const SERIES = {
  light: ['#be123c', '#2a78d6', '#1baf7a'],
  dark: ['#f43f5e', '#3987e5', '#199e70'],
}

function useChartTheme() {
  const dark = useUi((s) => s.theme === 'dark')
  return {
    series: dark ? SERIES.dark : SERIES.light,
    grid: dark ? '#1e293b' : '#eef2f6',
    axis: dark ? '#94a3b8' : '#64748b',
    surface: dark ? '#0f172a' : '#ffffff',
  }
}

function TooltipBox({
  active,
  payload,
  label,
  money = true,
}: {
  active?: boolean
  payload?: { name: string; value: number; color?: string; payload?: Record<string, unknown> }[]
  label?: string
  money?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-muted-foreground">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular">{money ? formatMoney(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function RevenueAreaChart({
  data,
  height = 280,
}: {
  data: { label: string; revenue: number }[]
  height?: number
}) {
  const t = useChartTheme()
  const c = t.series[0]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.18} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: t.axis }} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: t.axis }} tickFormatter={formatCompact} width={60} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: t.axis, strokeDasharray: '3 3' }} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Chiffre d’affaires"
          stroke={c}
          strokeWidth={2}
          fill="url(#rev)"
          activeDot={{ r: 5, strokeWidth: 2, stroke: t.surface }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SimpleBarChart({
  data,
  dataKey,
  xKey,
  name,
  height = 240,
  money = true,
}: {
  data: Record<string, unknown>[]
  dataKey: string
  xKey: string
  name: string
  height?: number
  money?: boolean
}) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: t.axis }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: t.axis }}
          tickFormatter={money ? formatCompact : undefined}
          width={60}
          allowDecimals={false}
        />
        <Tooltip content={<TooltipBox money={money} />} cursor={{ fill: t.grid, opacity: 0.6 }} />
        <Bar dataKey={dataKey} name={name} fill={t.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({ data, height = 156 }: { data: { name: string; value: number }[]; height?: number }) {
  const t = useChartTheme()
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              stroke={t.surface}
              strokeWidth={2}
              cornerRadius={4}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={t.series[i % t.series.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-sm font-semibold tabular">{formatCompact(total)}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: t.series[i % t.series.length] }} />
            <span className="whitespace-nowrap text-muted-foreground">{d.name}</span>
            <span className="ml-auto whitespace-nowrap font-semibold tabular">{total ? Math.round((d.value / total) * 100) : 0} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Liste à barres horizontales — lisible et minimaliste pour les classements. */
export function BarList({
  items,
  format = formatMoney,
}: {
  items: { key: string; label: React.ReactNode; value: number; sub?: string }[]
  format?: (v: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium">{i.label}</span>
            <span className="shrink-0 tabular text-muted-foreground">
              {i.sub && <span className="mr-2">{i.sub}</span>}
              <span className="font-semibold text-foreground">{format(i.value)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
