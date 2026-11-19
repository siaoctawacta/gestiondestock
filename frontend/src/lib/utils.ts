import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const money = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Montant en francs CFA, code ISO 4217 : XOF. */
// Espaces insécables : un montant (« 55 000 XOF ») ne se coupe jamais sur deux lignes.
export function formatMoney(value: number, withUnit = true) {
  const v = money.format(Math.round(value || 0)).replace(/\u202f/g, '\u00a0')
  return withUnit ? `${v}\u00a0XOF` : v
}

export function formatCompact(value: number) {
  const abs = Math.abs(value)
  const f = (v: number, unit: string) => `${String(Number(v.toFixed(1))).replace('.', ',')} ${unit}`
  if (abs >= 1_000_000_000) return f(value / 1_000_000_000, 'Md')
  if (abs >= 1_000_000) return f(value / 1_000_000, 'M')
  if (abs >= 1_000) return f(value / 1_000, 'k')
  return String(Math.round(value))
}

export function formatNumber(value: number) {
  return money.format(value || 0).replace(/\u202f|\u00a0/g, ' ')
}

export function formatPct(value: number, digits = 1) {
  return `${(value || 0).toFixed(digits).replace('.', ',')} %`
}

export function formatDate(iso: string | null | undefined, pattern = 'dd MMM yyyy') {
  if (!iso) return '—'
  return format(parseISO(iso), pattern, { locale: fr })
}

export function formatDateTime(iso: string | null | undefined) {
  return formatDate(iso, 'dd MMM yyyy · HH:mm')
}

export function timeAgo(iso: string) {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: fr })
}

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function uid() {
  return crypto.randomUUID()
}

export function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

/** Marge brute et taux de marque calculés sur le prix HT. */
export function computeMargin(purchaseHT: number, sellingTTC: number, vatRate: number) {
  const sellingHT = sellingTTC / (1 + vatRate / 100)
  const margin = sellingHT - purchaseHT
  const markupRate = sellingHT > 0 ? (margin / sellingHT) * 100 : 0
  const coefficient = purchaseHT > 0 ? sellingHT / purchaseHT : 0
  return { sellingHT, margin, markupRate, coefficient }
}

export function sum<T>(items: T[], fn: (item: T) => number) {
  return items.reduce((acc, it) => acc + (fn(it) || 0), 0)
}

export function groupBy<T, K extends string>(items: T[], fn: (item: T) => K) {
  return items.reduce(
    (acc, it) => {
      const k = fn(it)
      ;(acc[k] ||= []).push(it)
      return acc
    },
    {} as Record<K, T[]>,
  )
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message)
  return 'Une erreur inattendue est survenue'
}
