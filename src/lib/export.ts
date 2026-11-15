import { format } from 'date-fns'
import { BRAND, loadImage } from './brand'

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number
  /** Alignement à droite (montants). */
  numeric?: boolean
}

export interface ExportSheet<T = unknown> {
  name: string
  columns: ExportColumn<T>[]
  rows: T[]
}

const stamp = () => format(new Date(), 'yyyyMMdd-HHmm')
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** Export Excel (.xlsx) multi-feuilles. */
export async function exportExcel(title: string, sheets: ExportSheet<any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  sheets.forEach((s) => {
    const data = [s.columns.map((c) => c.header), ...s.rows.map((r) => s.columns.map((c) => c.value(r)))]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = s.columns.map((c, i) => ({
      wch: Math.min(40, Math.max(c.header.length, ...data.slice(1, 200).map((row) => String(row[i] ?? '').length)) + 2),
    }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  })
  XLSX.writeFile(wb, `${slug(title)}-${stamp()}.xlsx`)
}

/** Export PDF mis en page (paysage A4, en-tête MM Cosmétiques, tableaux). */
export async function exportPdf(
  title: string,
  sheets: ExportSheet<any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  meta: { subtitle?: string; summary?: [string, string][] } = {},
) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  const logo = await loadImage('/logo-white.png').catch(() => null)
  const header = () => {
    doc.setFillColor(...BRAND.greenRgb).rect(0, 0, W, 18, 'F')
    doc.setFillColor(...BRAND.sageRgb).rect(0, 18, W, 0.8, 'F')
    if (logo) doc.addImage(logo.data, 'PNG', 10, 3.5, 11 * logo.ratio, 11)
    else doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(11).text(BRAND.name, 10, 10.5)
    doc.setTextColor(255).setFont('helvetica', 'normal').setFontSize(8).text(`Stock Pro · ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, W - 10, 10.5, { align: 'right' })
    doc.setTextColor(24, 46, 28)
  }
  header()
  doc.setFont('helvetica', 'bold').setFontSize(16).text(title, 10, 30)
  let y = 36
  if (meta.subtitle) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 112, 95).text(meta.subtitle, 10, y)
    doc.setTextColor(24, 46, 28)
    y += 6
  }
  if (meta.summary?.length) {
    const boxW = (W - 20 - (meta.summary.length - 1) * 4) / meta.summary.length
    meta.summary.forEach(([label, value], i) => {
      const x = 10 + i * (boxW + 4)
      doc.setDrawColor(222, 230, 216).setFillColor(247, 250, 244).roundedRect(x, y, boxW, 16, 2, 2, 'FD')
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(100, 112, 95).text(label, x + 3, y + 5.5)
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BRAND.greenRgb).text(value, x + 3, y + 12)
    })
    y += 22
  }

  sheets.forEach((s, idx) => {
    if (sheets.length > 1) {
      doc.setFont('helvetica', 'bold').setFontSize(11).text(s.name, 10, y + 4)
      y += 7
    }
    autoTable(doc, {
      startY: y,
      head: [s.columns.map((c) => c.header)],
      body: s.rows.map((r) => s.columns.map((c) => String(c.value(r)))),
      margin: { left: 10, right: 10, top: 24 },
      styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 33], lineColor: [222, 230, 216] },
      headStyles: { fillColor: [236, 243, 226], textColor: [24, 70, 32], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 252, 248] },
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, { halign: c.numeric ? 'right' : 'left' }])),
      didDrawPage: () => header(),
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    if (idx < sheets.length - 1 && y > 170) {
      doc.addPage()
      y = 28
    }
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(140, 150, 135)
    doc.text(`Page ${i} / ${pages}`, W - 10, doc.internal.pageSize.getHeight() - 6, { align: 'right' })
    doc.text(`Document confidentiel — ${BRAND.name}`, 10, doc.internal.pageSize.getHeight() - 6)
  }
  doc.save(`${slug(title)}-${stamp()}.pdf`)
}

/** Les montants PDF utilisent des espaces simples (police standard). */
export const pdfMoney = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v)).replace(/\u202f|\u00a0/g, ' ')} F`
