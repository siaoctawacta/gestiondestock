<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Support\Audit;
use App\Support\Counter;
use App\Support\Permissions;
use Illuminate\Support\Facades\DB;

/**
 * Encaissement. Les totaux sont recalculés ici à partir des prix du catalogue :
 * le poste de caisse n'envoie que les produits, les quantités et la remise.
 * Même calcul que frontend/src/data/logic.ts (computeSaleTotals).
 */
class SaleService
{
    public function __construct(private StockService $stock) {}

    /**
     * @param  array<array{product_id:string,quantity:int}>  $lines
     * @param  array<array<string,mixed>>  $payments
     */
    public function create(User $cashier, string $storeId, array $lines, float $discount, array $payments, ?string $supervisorId): Sale
    {
        Permissions::require($cashier, 'pos');
        Permissions::requireStore($cashier, $storeId);

        $store = Store::whereKey($storeId)->whereNull('deleted_at')->where('is_active', true)->first();
        if (! $store) {
            throw new BusinessException('Boutique introuvable ou fermée.');
        }

        // Regroupe les lignes d'un même produit
        $qty = [];
        foreach ($lines as $l) {
            $q = (int) $l['quantity'];
            if ($q > 0) {
                $qty[$l['product_id']] = ($qty[$l['product_id']] ?? 0) + $q;
            }
        }
        if (! $qty) {
            throw new BusinessException('Le panier est vide.');
        }

        $products = Product::whereIn('id', array_keys($qty))->where('is_active', true)->get()->keyBy('id');
        if ($products->count() !== count($qty)) {
            throw new BusinessException('Un produit du panier est introuvable ou inactif.');
        }

        $subtotal = 0.0;
        foreach ($qty as $pid => $q) {
            $subtotal += $products[$pid]->selling_price * $q;
        }
        $discount = min(max(0, round($discount)), $subtotal);
        $total = $subtotal - $discount;
        $ratio = $subtotal > 0 ? $total / $subtotal : 0;
        $pct = $subtotal > 0 ? $discount / $subtotal * 100 : 0;

        if ($pct > Permissions::DISCOUNT_SUPERVISOR_THRESHOLD && ! Permissions::can($cashier, 'discount.approve')) {
            $sup = $supervisorId ? User::find($supervisorId) : null;
            if (! $sup || ! $sup->isUsable() || ! Permissions::can($sup, 'discount.approve')) {
                throw new BusinessException('Remise supérieure à 15 % : validation superviseur requise.');
            }
        }

        $paid = array_sum(array_map(fn ($p) => (float) ($p['amount'] ?? 0), $payments));
        if (round($paid) !== round($total)) {
            throw new BusinessException('Le montant réglé ne correspond pas au total.');
        }

        return DB::transaction(function () use ($cashier, $store, $qty, $products, $subtotal, $discount, $total, $ratio, $pct, $payments, $supervisorId) {
            $code = str_replace('BTQ-', '', $store->code);
            $reference = sprintf('TK-%s-%06d', $code, Counter::next('sale'));

            $tax = 0.0;
            $items = [];
            foreach ($qty as $pid => $q) {
                $p = $products[$pid];
                $lineTotal = $p->selling_price * $q;
                $tax += ($lineTotal * $ratio) * $p->vat_rate / (100 + $p->vat_rate);
                $items[] = [
                    'product_id' => $pid,
                    'product_name' => $p->name,
                    'quantity' => $q,
                    'unit_price' => $p->selling_price,
                    'purchase_price' => $p->purchase_price,
                    'vat_rate' => $p->vat_rate,
                    'line_total' => $lineTotal,
                ];
            }

            $sale = Sale::create([
                'reference' => $reference,
                'store_id' => $store->id,
                'cashier_id' => $cashier->id,
                'supervisor_id' => $pct > Permissions::DISCOUNT_SUPERVISOR_THRESHOLD ? $supervisorId : null,
                'subtotal' => $subtotal,
                'discount_amount' => $discount,
                'tax_amount' => round($tax),
                'total' => $total,
                'status' => 'completed',
            ]);
            $sale->items()->createMany($items);
            $sale->payments()->createMany(array_map(fn ($p) => [
                'method' => $p['method'],
                'provider' => ($p['method'] ?? null) === 'mobile_money' ? ($p['provider'] ?? null) : null,
                'amount' => (float) $p['amount'],
                'amount_received' => isset($p['amount_received']) ? (float) $p['amount_received'] : null,
                'change_given' => isset($p['change_given']) ? (float) $p['change_given'] : null,
            ], $payments));

            foreach ($qty as $pid => $q) {
                $this->stock->apply($store->id, $pid, -$q, 'sale', null, null, null, $reference);
            }

            if ($pct > Permissions::DISCOUNT_SUPERVISOR_THRESHOLD) {
                Audit::log('DISCOUNT', 'sales', $sale->id, sprintf('Remise de %s %% sur %s', number_format($pct, 1, ',', ' '), $reference));
            }

            return $sale->load('items', 'payments');
        });
    }

    /** Total des ventes encaissées d'une boutique pour une journée (montant théorique de caisse). */
    public static function dayTotal(string $storeId, string $date): float
    {
        return (float) Sale::where('store_id', $storeId)
            ->where('status', 'completed')
            ->whereBetween('created_at', [$date.' 00:00:00', $date.' 23:59:59'])
            ->sum('total');
    }
}
