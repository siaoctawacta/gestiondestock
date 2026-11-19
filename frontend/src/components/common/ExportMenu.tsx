import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown'
import { errorMessage } from '@/lib/utils'

export function ExportMenu({ onPdf, onExcel, size = 'default' }: { onPdf: () => Promise<void>; onExcel: () => Promise<void>; size?: 'default' | 'sm' }) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      toast.success('Export généré')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="outline" size={size} loading={busy}>
          {!busy && <Download />} Exporter
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => run(onPdf)}>
          <FileText /> PDF (mise en page)
        </DropdownItem>
        <DropdownItem onSelect={() => run(onExcel)}>
          <FileSpreadsheet /> Excel (.xlsx)
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}
