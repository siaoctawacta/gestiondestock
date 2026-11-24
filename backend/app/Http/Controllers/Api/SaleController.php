<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\SaleService;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SaleController extends Controller
{
    public function __construct(private SaleService $sales) {}

    /** Un caissier ne voit que ses ventes ; le Gestionnaire Stock ne voit pas les ventes. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        Permissions::require($user, 'sales.view');
        $f = $request->validate([
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
            'store_id' => 'nullable|uuid',
            'cashier_id' => 'nullable|uuid',
        ]);
        $scope = Permissions::storeScope($user);

        $rows = Sale::with('items', 'payments')
            ->when($scope !== null, fn ($q) => $q->whereIn('store_id', $scope))
            ->when($user->role_id === 'cashier', fn ($q) => $q->where('cashier_id', $user->id))
            ->when($f['store_id'] ?? null, fn ($q, $v) => $q->where('store_id', $v))
            ->when($f['cashier_id'] ?? null, fn ($q, $v) => $q->where('cashier_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v.' 00:00:00'))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->orderByDesc('created_at')->limit(5000)->get();

        return response()->json($rows->map(fn ($s) => Present::sale($s)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'store_id' => 'required|uuid',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid',
            'items.*.quantity' => 'required|integer|min:1',
            'discount_amount' => 'nullable|numeric|min:0',
            'supervisor_id' => 'nullable|uuid',
            'payments' => 'required|array|min:1',
            'payments.*.method' => ['required', Rule::in(['cash', 'mobile_money', 'card'])],
            'payments.*.provider' => ['nullable', Rule::in(['wave', 'orange_money', 'mtn'])],
            'payments.*.amount' => 'required|numeric|min:0',
            'payments.*.amount_received' => 'nullable|numeric|min:0',
            'payments.*.change_given' => 'nullable|numeric|min:0',
        ]);
        $sale = $this->sales->create(
            $request->user(), $data['store_id'], $data['items'], (float) ($data['discount_amount'] ?? 0),
            $data['payments'], $data['supervisor_id'] ?? null,
        );

        return response()->json(Present::sale($sale), 201);
    }
}
