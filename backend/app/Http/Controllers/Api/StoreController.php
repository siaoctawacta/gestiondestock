<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\User;
use App\Services\BusinessException;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Boutiques : lecture pour tous (noms dans l'historique), écriture réservée au Super Admin. */
class StoreController extends Controller
{
    public function index(): JsonResponse
    {
        // Les boutiques supprimées restent renvoyées : leurs ventes passées affichent leur nom.
        return response()->json(Store::orderBy('name')->get()->map(fn ($s) => Present::store($s)));
    }

    public function store(Request $request): JsonResponse
    {
        Permissions::require($request->user(), 'stores.edit');
        $data = $this->validated($request, null);

        $store = DB::transaction(function () use ($data) {
            $store = Store::create($data + ['is_active' => true]);
            // Une ligne de stock à 0 pour chaque produit du catalogue
            $now = now();
            InventoryItem::insert(Product::pluck('id')->map(fn ($pid) => [
                'id' => (string) Str::uuid7(), 'store_id' => $store->id, 'product_id' => $pid, 'quantity' => 0, 'updated_at' => $now,
            ])->all());
            Audit::log('INSERT', 'stores', $store->id, "Création de {$store->name}");

            return $store;
        });

        return response()->json(Present::store($store), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        Permissions::require($request->user(), 'stores.edit');
        $store = Store::whereKey($id)->whereNull('deleted_at')->firstOrFail();
        $store->update($this->validated($request, $store));
        Audit::log('UPDATE', 'stores', $store->id, "Modification de {$store->name}");

        return response()->json(Present::store($store));
    }

    /** Suppression logique : la boutique disparaît des listes, ses ventes et mouvements restent. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        Permissions::require($request->user(), 'stores.edit');
        DB::transaction(function () use ($id) {
            $store = Store::whereKey($id)->whereNull('deleted_at')->lockForUpdate()->firstOrFail();
            $inTransit = StockTransfer::where('status', 'in_transit')
                ->where(fn ($q) => $q->where('source_store_id', $id)->orWhere('dest_store_id', $id))->exists();
            if ($inTransit) {
                throw new BusinessException('Des transferts sont en transit avec cette boutique : réceptionnez-les ou annulez-les d’abord.');
            }
            $assigned = User::where('store_id', $id)->whereNull('deleted_at')->count();
            if ($assigned > 0) {
                throw new BusinessException("{$assigned} utilisateur(s) ont cette boutique comme boutique principale : réaffectez-les ou supprimez-les d’abord.");
            }
            DB::table('user_stores')->where('store_id', $id)->delete();
            $store->update(['deleted_at' => now(), 'is_active' => false, 'manager_id' => null]);
            Audit::log('DELETE', 'stores', $store->id, "Suppression de {$store->name} (historique conservé)");
        });

        return response()->json(null, 204);
    }

    private function validated(Request $request, ?Store $store): array
    {
        $data = $request->validate([
            'name' => [$store ? 'sometimes' : 'required', 'string', 'max:255'],
            'code' => [$store ? 'sometimes' : 'required', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'region' => ['nullable', 'string', 'max:100'],
            'manager_id' => ['nullable', 'uuid', 'exists:users,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        foreach (['address', 'phone', 'email', 'region'] as $f) {
            if (array_key_exists($f, $data)) {
                $data[$f] = (string) ($data[$f] ?? '');
            }
        }
        if (isset($data['code'])) {
            $data['code'] = mb_strtoupper(trim($data['code']));
            $taken = Store::where('code', $data['code'])->whereNull('deleted_at')->when($store, fn ($q) => $q->where('id', '!=', $store->id))->exists();
            if ($taken) {
                throw new BusinessException('Ce code boutique existe déjà.');
            }
        }

        return $data;
    }
}
