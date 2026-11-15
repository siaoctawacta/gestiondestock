import { cn, initials } from '@/lib/utils'

const COLORS = ['bg-lime-100 text-green-800', 'bg-slate-200 text-slate-700', 'bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700']

export function Avatar({ first, last, className }: { first: string; last: string; className?: string }) {
  const idx = (first.charCodeAt(0) + (last.charCodeAt(0) || 0)) % COLORS.length
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold', COLORS[idx], className)}>
      {initials(first, last)}
    </span>
  )
}
