import { cn } from '@/lib/utils'
import type { Product } from '@/types'

const TONES = [
  'from-rose-100 to-rose-200 text-rose-700',
  'from-amber-50 to-amber-200 text-amber-700',
  'from-slate-100 to-slate-200 text-slate-600',
  'from-pink-50 to-fuchsia-100 text-fuchsia-700',
  'from-orange-50 to-orange-100 text-orange-700',
  'from-emerald-50 to-teal-100 text-teal-700',
]

export function ProductThumb({ product, className }: { product: Pick<Product, 'name' | 'image_url' | 'brand'>; className?: string }) {
  if (product.image_url)
    return <img src={product.image_url} alt={product.name} className={cn('size-10 shrink-0 rounded-lg object-cover', className)} />
  const tone = TONES[(product.name.charCodeAt(0) + product.name.length) % TONES.length]
  const letters = product.name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-semibold', tone, className)}>
      {letters.toUpperCase()}
    </span>
  )
}
