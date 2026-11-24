<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StockTransfer;
use App\Services\TransferService;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferController extends Controller
{
    public function __construct(private TransferService $transfers) {}

    public function index(Request $request): JsonResponse
    {
        Permissions::require($request->user(), 'transfers.view');
        $scope = Permissions::storeScope($request->user());
        $rows = StockTransfer::with('items')
            ->when($scope !== null, fn ($q) => $q->where(fn ($w) => $w->whereIn('source_store_id', $scope)->orWhereIn('dest_store_id', $scope)))
            ->orderByDesc('created_at')->get();

        return response()->json($rows->map(fn ($t) => Present::transfer($t)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_store_id' => 'required|uuid|exists:stores,id',
            'dest_store_id' => 'required|uuid|exists:stores,id',
            'notes' => 'nullable|string|max:1000',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:0',
        ]);
        $t = $this->transfers->create($request->user(), $data['source_store_id'], $data['dest_store_id'], $data['items'], $data['notes'] ?? null);

        return response()->json(Present::transfer($t), 201);
    }

    public function receive(Request $request, string $id): JsonResponse
    {
        $this->transfers->receive($request->user(), $id);

        return response()->json(null, 204);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $this->transfers->cancel($request->user(), $id);

        return response()->json(null, 204);
    }
}
