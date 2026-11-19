import { Badge, type BadgeVariant } from '@/components/ui/badge'
import type { MovementType, PaymentMethod, ReportStatus, TransferStatus } from '@/types'

const REPORT: Record<ReportStatus, [string, BadgeVariant]> = {
  draft: ['Brouillon', 'neutral'],
  submitted: ['Envoyé', 'info'],
  validated: ['Validé', 'success'],
  rejected: ['Rejeté', 'danger'],
}
export const ReportStatusBadge = ({ status }: { status: ReportStatus }) => (
  <Badge variant={REPORT[status][1]} dot>
    {REPORT[status][0]}
  </Badge>
)

const TRANSFER: Record<TransferStatus, [string, BadgeVariant]> = {
  in_transit: ['En transit', 'warning'],
  received: ['Reçu', 'success'],
  cancelled: ['Annulé', 'neutral'],
}
export const TransferStatusBadge = ({ status }: { status: TransferStatus }) => (
  <Badge variant={TRANSFER[status][1]} dot>
    {TRANSFER[status][0]}
  </Badge>
)

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  entry: 'Entrée',
  sale: 'Vente',
  adjustment: 'Ajustement',
  transfer_out: 'Transfert sortant',
  transfer_in: 'Transfert entrant',
}
const MOVEMENT_VARIANT: Record<MovementType, BadgeVariant> = {
  entry: 'success',
  sale: 'default',
  adjustment: 'warning',
  transfer_out: 'info',
  transfer_in: 'info',
}
export const MovementBadge = ({ type }: { type: MovementType }) => (
  <Badge variant={MOVEMENT_VARIANT[type]}>{MOVEMENT_LABELS[type]}</Badge>
)

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  card: 'Carte bancaire',
}
export const PROVIDER_LABELS: Record<string, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn: 'MTN MoMo',
}

export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  if (quantity <= 0) return <Badge variant="danger" dot>Rupture</Badge>
  if (quantity <= min) return <Badge variant="warning" dot>Faible</Badge>
  return <Badge variant="success" dot>OK</Badge>
}
