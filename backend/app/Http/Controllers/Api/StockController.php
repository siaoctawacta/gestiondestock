<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use App\Services\StockService;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Stocks par boutique, entrées, ajustements, seuils et journal des mouvements. */
class StockController extends Controller
{
    public const ADJUST_REASONS = ['breakage', 'theft', 'expired', 'tester', 'inventory', 'other'];

    public function __construct(private StockService $stock) {}

    public function inventory(Request $request): JsonResponse
    {
        $scope = Permissions::storeScope($request->user());
        $rows = InventoryItem::query()->when($scope !== null, fn ($q) => $q->whereIn('store_id', $scope))->get();

        return response()->json($rows->map(fn ($i) => Present::inventory($i)));
    }

    public function setMinLevel(Request $request): JsonResponse
    {
        $user = $request->user();
        Permissions::require($user, 'inventory.adjust');
        $data = $request->validate([
            'store_id' => 'required|uuid',
            'product_id' => 'required|uuid',
            'min_stock_level' => 'nullable|integer|min:0',
        ]);
        Permissions::requireStore($user, $data['store_id']);
        InventoryItem::where('store_id', $data['store_id'])->where('product_id', $data['product_id'])
            ->update(['min_stock_level' => $data['min_stock_level']]);

        return response()->json(null, 204);
    }

    public function movements(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->query('limit', 500), 1), 2000);
        $scope = Permissions::storeScope($request->user());
        $rows = StockMovement::query()
            ->when($scope !== null, fn ($q) => $q->whereIn('store_id', $scope))
            ->orderByDesc('created_at')->limit($limit)->get();

        return response()->json($rows->map(fn ($m) => Present::movement($m)));
    }

    public function entry(Request $request): JsonResponse
    {
        $user = $request->user();
        Permissions::require($user, 'inventory.move');
        $data = $request->validate([
            'store_id' => 'required|uuid|exists:stores,id',
            'product_id' => 'required|uuid|exists:products,id',
            'quantity' => 'required|integer|min:1',
            'lot_number' => 'required|string|max:100',
            'expiry_date' => 'nullable|date',
            'reference' => 'nullable|string|max:100',
        ], ['lot_number.required' => 'Le numéro de lot est obligatoire.', 'quantity.min' => 'La quantité doit être positive.']);
        Permissions::requireStore($user, $data['store_id']);

        DB::transaction(fn () => $this->stock->apply(
            $data['store_id'], $data['product_id'], (int) $data['quantity'], 'entry', 'Réception marchandise',
            $data['lot_number'], $data['expiry_date'] ?? null, $data['reference'] ?? null,
        ));

        return response()->json(null, 201);
    }

    public function adjust(Request $request): JsonResponse
    {
        $user = $request->user();
        Permissions::require($user, 'inventory.adjust');
        $data = $request->validate([
            'store_id' => 'required|uuid|exists:stores,id',
            'product_id' => 'required|uuid|exists:products,id',
            'quantity' => 'required|integer|not_in:0',
            'reason' => ['required', Rule::in(self::ADJUST_REASONS)],
            'note' => 'nullable|string|max:500',
        ], ['quantity.not_in' => 'Quantité nulle.']);
        Permissions::requireStore($user, $data['store_id']);

        DB::transaction(function () use ($data) {
            $note = trim((string) ($data['note'] ?? ''));
            $this->stock->apply($data['store_id'], $data['product_id'], (int) $data['quantity'], 'adjustment',
                $data['reason'].($note !== '' ? " — {$note}" : ''));
            Audit::log('ADJUST', 'inventory', $data['product_id'], sprintf('Ajustement %+d (%s)', $data['quantity'], $data['reason']));
        });

        return response()->json(null, 201);
    }
}
