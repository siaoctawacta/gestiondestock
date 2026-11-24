<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\User;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    /** Notifications visibles : personnelles, ou ciblées sur mon rôle et mes boutiques. */
    private function visible(User $user): Builder
    {
        $scope = Permissions::storeScope($user);

        return AppNotification::query()->where(function ($q) use ($user, $scope) {
            $q->where('user_id', $user->id)->orWhere(function ($w) use ($user, $scope) {
                $w->whereNull('user_id')
                    ->where(fn ($r) => $r->whereNull('target_roles')->orWhereJsonContains('target_roles', $user->role_id))
                    ->when($scope !== null, fn ($s) => $s->where(fn ($x) => $x->whereNull('store_id')->orWhereIn('store_id', $scope)));
            });
        });
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $rows = $this->visible($user)->orderByDesc('created_at')->limit(100)->get();
        $read = DB::table('notification_reads')->where('user_id', $user->id)
            ->whereIn('notification_id', $rows->pluck('id'))->pluck('notification_id')->flip();

        return response()->json($rows->map(fn ($n) => Present::notification($n, isset($read[$n->id]))));
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if ($this->visible($user)->whereKey($id)->exists()) {
            DB::table('notification_reads')->insertOrIgnore(['notification_id' => $id, 'user_id' => $user->id, 'read_at' => now()]);
        }

        return response()->json(null, 204);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $ids = $this->visible($user)->orderByDesc('created_at')->limit(500)->pluck('id');
        DB::table('notification_reads')->insertOrIgnore($ids->map(fn ($id) => [
            'notification_id' => $id, 'user_id' => $user->id, 'read_at' => now(),
        ])->all());

        return response()->json(null, 204);
    }
}
