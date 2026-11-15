import type { Profile, Sale, Store } from '@/types'
import { formatMoney, formatDateTime } from './utils'
import { PAYMENT_LABELS, PROVIDER_LABELS } from '@/components/common/badges'
import { loadImage } from './brand'

/** Ticket de caisse au format thermique 80 mm (PDF). */
export async function generateReceiptPdf(sale: Sale, store: Store | undefined, cashier: Profile | undefined, open = true) {
  const { jsPDF } = await import('jspdf')
  const width = 80
  const lineH = 4.2
  const height = 128 + sale.items.length * 9 + sale.payments.length * 8
  const doc = new jsPDF({ unit: 'mm', format: [width, height] })
  const m = 5
  let y = 8

  const center = (text: string, size = 8, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    doc.text(text, width / 2, y, { align: 'center' })
    y += lineH * (size / 8)
  }
  const row = (left: string, right: string, size = 8, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    doc.text(left, m, y)
    doc.text(right, width - m, y, { align: 'right' })
    y += lineH * (size / 8)
  }
  const sep = () => {
    doc.setLineDashPattern([0.6, 0.6], 0).setDrawColor(150).line(m, y - 1.5, width - m, y - 1.5)
    y += 2
  }
  const money = (v: number) => formatMoney(v)

  // Logo MM Cosmétiques
  try {
    const logo = await loadImage('/logo.png')
    const w = 46
    const h = w / logo.ratio
    doc.addImage(logo.data, 'PNG', (width - w) / 2, y - 4, w, h)
    y += h + 2
  } catch {
    center('MM COSMÉTIQUES', 11, true)
  }
  center(store?.name ?? '', 8, true)
  if (store?.address) center(store.address, 7)
  if (store?.phone) center(`Tél. ${store.phone}`, 7)
  y += 2
  sep()
  row('Ticket', sale.reference, 7.5, true)
  row('Date', formatDateTime(sale.created_at), 7.5)
  row('Caissier', cashier ? `${cashier.first_name} ${cashier.last_name[0]}.` : '—', 7.5)
  sep()

  sale.items.forEach((i) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.5)
    const name = doc.splitTextToSize(i.product_name, width - 2 * m)[0]
    doc.text(name, m, y)
    y += lineH
    row(`  ${i.quantity} x ${money(i.unit_price)}`, money(i.line_total), 7.5)
  })
  sep()
  row('Sous-total', money(sale.subtotal))
  if (sale.discount_amount > 0) row('Remise', `- ${money(sale.discount_amount)}`)
  row('Dont TVA (18 %)', money(sale.tax_amount), 7)
  row('Total HT', money(sale.total - sale.tax_amount), 7)
  y += 1
  row('TOTAL TTC', money(sale.total), 11, true)
  y += 1
  sep()
  sale.payments.forEach((p) => {
    row(`${PAYMENT_LABELS[p.method]}${p.provider ? ` · ${PROVIDER_LABELS[p.provider]}` : ''}`, money(p.amount), 7.5)
    if (p.method === 'cash' && p.amount_received !== null) {
      row('  Reçu', money(p.amount_received), 7.5)
      row('  Rendu', money(p.change_given ?? 0), 7.5, true)
    }
  })
  sep()
  y += 1
  center('Merci de votre visite !', 8, true)
  center('Les produits cosmétiques ouverts ne sont', 6.5)
  center('ni repris ni échangés.', 6.5)
  center(store?.email ?? 'MM Cosmétiques', 6.5)

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  if (open) {
    const w = window.open(url, '_blank')
    if (!w) doc.save(`${sale.reference}.pdf`)
  }
  return url
}
