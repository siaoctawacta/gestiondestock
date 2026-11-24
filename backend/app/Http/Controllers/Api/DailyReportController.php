<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Services\DailyReportService;
use App\Services\SaleService;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DailyReportController extends Controller
{
    public function __construct(private DailyReportService $reports) {}

    public function index(Request $request): JsonResponse
    {
        Permissions::require($request->user(), 'reports.daily.view');
        $scope = Permissions::storeScope($request->user());
        $rows = DailyReport::with('expenses')
            ->when($scope !== null, fn ($q) => $q->whereIn('store_id', $scope))
            ->orderByDesc('report_date')->orderByDesc('created_at')->get();

        return response()->json($rows->map(fn ($r) => Present::report($r)));
    }

    public function theoretical(Request $request): JsonResponse
    {
        $data = $request->validate(['store_id' => 'required|uuid', 'date' => 'required|date_format:Y-m-d']);
        Permissions::requireStore($request->user(), $data['store_id']);

        return response()->json(['amount' => SaleService::dayTotal($data['store_id'], $data['date'])]);
    }

    /** Création (sans id) ou modification (avec id) d'un brouillon. */
    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => 'nullable|uuid',
            'store_id' => 'required|uuid|exists:stores,id',
            'report_date' => 'required|date_format:Y-m-d|before_or_equal:today',
            'declared_amount' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:2000',
            'expenses' => 'nullable|array',
            'expenses.*.label' => 'nullable|string|max:255',
            'expenses.*.category' => 'nullable|string|max:100',
            'expenses.*.amount' => 'nullable|numeric|min:0',
        ], ['declared_amount.min' => 'Le montant encaissé ne peut pas être négatif.']);
        $r = $this->reports->save($request->user(), $data['id'] ?? null, $data['store_id'], $data['report_date'],
            (float) $data['declared_amount'], $data['notes'] ?? null, $data['expenses'] ?? []);

        return response()->json(Present::report($r));
    }

    public function submit(Request $request, string $id): JsonResponse
    {
        $this->reports->submit($request->user(), $id);

        return response()->json(null, 204);
    }

    public function validateReport(Request $request, string $id): JsonResponse
    {
        $this->reports->review($request->user(), $id, true, null);

        return response()->json(null, 204);
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        $reason = (string) $request->input('reason', '');
        $this->reports->review($request->user(), $id, false, $reason);

        return response()->json(null, 204);
    }
}
