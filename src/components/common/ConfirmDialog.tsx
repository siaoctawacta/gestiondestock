import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'

/** Confirmation d'une action irréversible (suppression…). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Supprimer',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="sm" title={title}>
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
