<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Store;
use App\Support\Notify;
use Illuminate\Support\Facades\Auth;

/**
 * Seul point d'écriture des quantités en stock. À appeler dans une transaction :
 * la ligne d'inventaire est verrouillée (SELECT … FOR UPDATE) pendant le mouvement.
 */
class StockService
{
    public function apply(
        string $storeId,
        string $productId,
        int $quantity,
        string $type,
        ?string $reason = null,
        ?string $lot = null,
        ?string $expiry = null,
        ?string $reference = null,
    ): void {
        InventoryItem::query()->insertOrIgnore([
            'id' => (string) \Illuminate\Support\Str::uuid7(),
            'store_id' => $storeId,
            'product_id' => $productId,
            'quantity' => 0,
            'updated_at' => now(),
        ]);

        $inv = InventoryItem::where('store_id', $storeId)->where('product_id', $productId)->lockForUpdate()->firstOrFail();
        $before = (int) $inv->quantity;
        $after = $before + $quantity;
        if ($after < 0) {
            $name = Product::whereKey($productId)->value('name') ?? 'produit';
            throw new BusinessException("Stock insuffisant pour « {$name} » (disponible : {$before}).");
        }

        $inv->quantity = $after;
        $inv->save();

        StockMovement::create([
            'product_id' => $productId,
            'store_id' => $storeId,
            'user_id' => Auth::id(),
            'type' => $type,
            'quantity' => $quantity,
            'reason' => $reason,
            'lot_number' => $lot,
            'expiry_date' => $expiry,
            'reference' => $reference,
        ]);

        $this->alerts($inv, $before, $after);
    }

    /** Alertes « stock faible » et « rupture » au franchissement du seuil. */
    private function alerts(InventoryItem $inv, int $before, int $after): void
    {
        $product = Product::find($inv->product_id);
        $store = Store::find($inv->store_id);
        if (! $product || ! $store) {
            return;
        }
        $min = $inv->min_stock_level ?? $product->min_stock_level;

        if ($after === 0 && $before > 0) {
            Notify::send('out_of_stock', 'critical', 'Rupture de stock', "{$product->name} est épuisé à {$store->name}.", $store->id, Notify::STOCK_ROLES);
        } elseif ($after <= $min && $before > $min) {
            Notify::send('low_stock', 'warning', 'Stock faible', "{$product->name} : {$after} unité(s) restante(s) à {$store->name}.", $store->id, Notify::STOCK_ROLES);
        }
    }
}
