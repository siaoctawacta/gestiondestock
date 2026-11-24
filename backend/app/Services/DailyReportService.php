<?php

namespace App\Services;

use App\Models\DailyReport;
use App\Models\Store;
use App\Models\User;
use App\Support\Audit;
use App\Support\Notify;
use App\Support\Permissions;
use Illuminate\Support\Facades\DB;

/**
 * Déclarations de fin de journée : Brouillon → Envoyé → Validé / Rejeté.
 * Écart = (montant encaissé + dépenses) − montant théorique des ventes.
 */
class DailyReportService
{
    /**
     * @param  array<array{label:string,category?:string,amount:float}>  $expenses
     */
    public function save(User $user, ?string $id, string $storeId, string $date, float $declared, ?string $notes, array $expenses): DailyReport
    {
        Permissions::require($user, 'reports.daily.edit');
        Permissions::requireStore($user, $storeId);
        if ($declared < 0) {
            throw new BusinessException('Le montant encaissé ne peut pas être négatif.');
        }
        $expenses = array_values(array_filter($expenses, fn ($e) => trim((string) ($e['label'] ?? '')) !== '' && (float) ($e['amount'] ?? 0) > 0));

        return DB::transaction(function () use ($user, $id, $storeId, $date, $declared, $notes, $expenses) {
            if ($id) {
                $r = DailyReport::whereKey($id)->lockForUpdate()->firstOrFail();
                Permissions::requireStore($user, $r->store_id);
                if (! in_array($r->status, ['draft', 'rejected'], true)) {
                    throw new BusinessException('Une déclaration envoyée ne peut plus être modifiée.');
                }
                $r->expenses()->delete();
            } else {
                if (DailyReport::where('store_id', $storeId)->whereDate('report_date', $date)->exists()) {
                    throw new BusinessException('Une déclaration existe déjà pour cette boutique à cette date.');
                }
                $r = new DailyReport(['store_id' => $storeId, 'user_id' => $user->id, 'report_date' => $date]);
            }
            $r->fill(['declared_amount' => $declared, 'notes' => $notes, 'status' => 'draft', 'rejection_reason' => null]);
            $r->save();
            $r->expenses()->createMany(array_map(fn ($e) => [
                'label' => $e['label'], 'category' => $e['category'] ?? 'Divers', 'amount' => (float) $e['amount'],
            ], $expenses));
            $this->recompute($r);

            return $r->load('expenses');
        });
    }

    public function submit(User $user, string $id): void
    {
        Permissions::require($user, 'reports.daily.edit');
        DB::transaction(function () use ($user, $id) {
            $r = DailyReport::whereKey($id)->lockForUpdate()->firstOrFail();
            Permissions::requireStore($user, $r->store_id);
            if (! in_array($r->status, ['draft', 'rejected'], true)) {
                throw new BusinessException('Déclaration déjà envoyée.');
            }
            $this->recompute($r);
            $r->update(['status' => 'submitted']);
            $store = Store::find($r->store_id);
            $date = $r->report_date->format('Y-m-d');
            Notify::send('daily_report', 'info', 'Nouvelle déclaration', "{$user->first_name} {$user->last_name} a soumis la déclaration du {$date} — {$store->name}.", $r->store_id, Notify::ADMIN_ROLES);
            if (abs($r->variance_pct) > Permissions::CASH_VARIANCE_TOLERANCE) {
                $pct = number_format($r->variance_pct, 1, ',', ' ');
                $amount = number_format(round($r->variance), 0, ',', ' ');
                Notify::send('cash_variance', 'critical', 'Écart de caisse', "Écart de {$pct} % ({$amount} XOF) sur {$store->name} le {$date}.", $r->store_id, Notify::ADMIN_ROLES);
            }
            Audit::log('SUBMIT', 'daily_reports', $r->id, "Déclaration {$store->code} du {$date}");
        });
    }

    public function review(User $user, string $id, bool $approve, ?string $reason): void
    {
        Permissions::require($user, 'reports.daily.validate');
        if (! $approve && trim((string) $reason) === '') {
            throw new BusinessException('Le motif de rejet est obligatoire.');
        }
        DB::transaction(function () use ($user, $id, $approve, $reason) {
            $r = DailyReport::whereKey($id)->lockForUpdate()->firstOrFail();
            Permissions::requireStore($user, $r->store_id);
            if ($r->status !== 'submitted') {
                throw new BusinessException('Seules les déclarations envoyées peuvent être traitées.');
            }
            $r->update([
                'status' => $approve ? 'validated' : 'rejected',
                'rejection_reason' => $approve ? null : $reason,
                'validated_by' => $user->id,
                'validated_at' => now(),
            ]);
            $date = $r->report_date->format('Y-m-d');
            Notify::send(
                'report_status',
                $approve ? 'info' : 'warning',
                $approve ? 'Déclaration validée' : 'Déclaration rejetée',
                $approve ? "Votre déclaration du {$date} a été validée." : "Déclaration du {$date} à corriger : {$reason}",
                $r->store_id,
                null,
                $r->user_id,
            );
            Audit::log($approve ? 'VALIDATE' : 'REJECT', 'daily_reports', $r->id, $approve ? 'Déclaration validée' : $reason);
        });
    }

    private function recompute(DailyReport $r): void
    {
        $theoretical = SaleService::dayTotal($r->store_id, $r->report_date->format('Y-m-d'));
        $expenses = (float) $r->expenses()->sum('amount');
        $variance = $r->declared_amount + $expenses - $theoretical;
        $r->update([
            'theoretical_amount' => $theoretical,
            'expenses_total' => $expenses,
            'variance' => $variance,
            'variance_pct' => $theoretical > 0 ? round($variance / $theoretical * 100, 2) : 0,
        ]);
    }
}
