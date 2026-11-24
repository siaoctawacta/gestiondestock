<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\User;
use App\Support\Audit;
use App\Support\Counter;
use App\Support\Notify;
use App\Support\Permissions;
use Illuminate\Support\Facades\DB;

/**
 * Transferts en deux étapes : expédition (quantités réservées), puis réception
 * (débit de la source et crédit de la destination dans la même transaction).
 */
class TransferService
{
    public function __construct(private StockService $stock) {}

    /** @param array<array{product_id:string,quantity:int}> $items */
    public function create(User $user, string $sourceId, string $destId, array $items, ?string $notes): StockTransfer
    {
        Permissions::require($user, 'transfers.create');
        Permissions::requireStore($user, $sourceId);
        if ($sourceId === $destId) {
            throw new BusinessException('Boutiques source et destination identiques.');
        }
        $items = array_values(array_filter($items, fn ($i) => (int) $i['quantity'] > 0));
        if (! $items) {
            throw new BusinessException('Ajoutez au moins un article.');
        }
        foreach ([$sourceId, $destId] as $sid) {
            if (! Store::whereKey($sid)->whereNull('deleted_at')->exists()) {
                throw new BusinessException('Boutique introuvable ou supprimée.');
            }
        }

        return DB::transaction(function () use ($user, $sourceId, $destId, $items, $notes) {
            foreach ($items as $it) {
                $stock = (int) DB::table('inventory')->where('store_id', $sourceId)->where('product_id', $it['product_id'])->lockForUpdate()->value('quantity');
                $reserved = (int) DB::table('transfer_items')
                    ->join('stock_transfers', 'stock_transfers.id', '=', 'transfer_items.transfer_id')
                    ->where('stock_transfers.status', 'in_transit')
                    ->where('stock_transfers.source_store_id', $sourceId)
                    ->where('transfer_items.product_id', $it['product_id'])
                    ->sum('transfer_items.quantity');
                if ($stock - $reserved < (int) $it['quantity']) {
                    $name = Product::whereKey($it['product_id'])->value('name') ?? 'produit';
                    throw new BusinessException("Stock disponible insuffisant pour « {$name} » (".($stock - $reserved).').');
                }
            }

            $t = StockTransfer::create([
                'reference' => sprintf('TRF-%06d', Counter::next('transfer')),
                'source_store_id' => $sourceId,
                'dest_store_id' => $destId,
                'status' => 'in_transit',
                'notes' => $notes,
                'created_by' => $user->id,
            ]);
            $t->items()->createMany(array_map(fn ($i) => ['product_id' => $i['product_id'], 'quantity' => (int) $i['quantity']], $items));

            $src = Store::find($sourceId)->name;
            $dst = Store::find($destId)->name;
            Notify::send('transfer', 'info', 'Transfert en transit', "{$t->reference} : {$src} → {$dst}. À réceptionner.", $destId, Notify::STOCK_ROLES);
            Audit::log('INSERT', 'stock_transfers', $t->id, "Expédition {$t->reference}");

            return $t->load('items');
        });
    }

    public function receive(User $user, string $id): void
    {
        Permissions::require($user, 'transfers.receive');
        DB::transaction(function () use ($user, $id) {
            $t = StockTransfer::whereKey($id)->lockForUpdate()->first();
            if (! $t || $t->status !== 'in_transit') {
                throw new BusinessException('Transfert introuvable ou déjà traité.');
            }
            Permissions::requireStore($user, $t->dest_store_id);
            foreach ($t->items as $it) {
                $this->stock->apply($t->source_store_id, $it->product_id, -$it->quantity, 'transfer_out', null, null, null, $t->reference);
                $this->stock->apply($t->dest_store_id, $it->product_id, $it->quantity, 'transfer_in', null, null, null, $t->reference);
            }
            $t->update(['status' => 'received', 'received_by' => $user->id, 'received_at' => now()]);
            Audit::log('RECEIVE', 'stock_transfers', $t->id, "Réception {$t->reference}");
        });
    }

    public function cancel(User $user, string $id): void
    {
        Permissions::require($user, 'transfers.create');
        DB::transaction(function () use ($user, $id) {
            $t = StockTransfer::whereKey($id)->lockForUpdate()->first();
            if (! $t || $t->status !== 'in_transit') {
                throw new BusinessException('Seuls les transferts en transit peuvent être annulés.');
            }
            Permissions::requireStore($user, $t->source_store_id);
            $t->update(['status' => 'cancelled']);
            Audit::log('CANCEL', 'stock_transfers', $t->id, "Annulation {$t->reference}");
        });
    }
}
