<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        Permissions::require($request->user(), 'audit');

        return response()->json(AuditLog::orderByDesc('created_at')->limit(500)->get()->map(fn ($a) => Present::audit($a)));
    }
}
