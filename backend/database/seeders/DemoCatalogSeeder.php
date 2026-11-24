<?php

namespace Database\Seeders;

use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\Supplier;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Catalogue de DÉMONSTRATION (30 produits et 4 fournisseurs fictifs, stock de 50 par boutique).
 * Pour une base de formation uniquement : ne pas lancer sur la base de production.
 */
class DemoCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([RoleSeeder::class, ReferenceSeeder::class]);
        $data = json_decode(file_get_contents(__DIR__.'/data/reference.json'), true, flags: JSON_THROW_ON_ERROR)['demo'];

        foreach ($data['suppliers'] as $s) {
            Supplier::query()->firstOrCreate(['id' => $s['id']], $s);
        }
        foreach ($data['products'] as $p) {
            Product::query()->firstOrCreate(['id' => $p['id']], $p);
        }
        $now = now();
        foreach (Store::whereNull('deleted_at')->pluck('id') as $storeId) {
            foreach (Product::pluck('id') as $productId) {
                InventoryItem::query()->insertOrIgnore([
                    'id' => (string) Str::uuid7(), 'store_id' => $storeId, 'product_id' => $productId, 'quantity' => 50, 'updated_at' => $now,
                ]);
            }
        }
    }
}
