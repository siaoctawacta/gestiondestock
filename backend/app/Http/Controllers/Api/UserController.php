<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\User;
use App\Services\BusinessException;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;

/** Comptes utilisateurs : lecture selon le périmètre, écriture réservée au Super Admin. */
class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        Permissions::require($me, 'users.view');
        $scope = Permissions::storeScope($me);
        $users = User::with('extraStores')
            ->when($scope !== null, fn ($q) => $q->where(fn ($w) => $w->whereIn('store_id', $scope)->orWhere('id', $me->id)))
            ->orderBy('last_name')->get();

        return response()->json($users->map(fn ($u) => Present::user($u)));
    }

    public function store(Request $request): JsonResponse
    {
        $me = $request->user();
        Permissions::require($me, 'users.manage');
        $data = $this->validated($request, null);

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => mb_strtolower(trim($data['email'])),
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'],
                'role_id' => $data['role'],
                'store_id' => $this->primaryStore($data),
                'is_active' => $data['is_active'] ?? true,
            ]);
            $user->extraStores()->sync($this->extraStores($data));
            Audit::log('INSERT', 'users', $user->id, "Création du compte {$user->email} ({$user->role_id})");

            return $user;
        });

        return response()->json(Present::user($user->fresh('extraStores')), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $me = $request->user();
        Permissions::require($me, 'users.manage');
        $user = User::whereKey($id)->whereNull('deleted_at')->firstOrFail();
        $data = $this->validated($request, $user);

        if ($user->role_id === 'super_admin' && isset($data['role']) && $data['role'] !== 'super_admin' && $this->otherSuperAdmins($user) === 0) {
            throw new BusinessException('Impossible de retirer le rôle du dernier Super Admin.');
        }

        DB::transaction(function () use ($user, $data) {
            $fields = array_intersect_key($data, array_flip(['first_name', 'last_name', 'phone']));
            if (isset($data['email'])) {
                $fields['email'] = mb_strtolower(trim($data['email']));
            }
            if (isset($data['role'])) {
                $fields['role_id'] = $data['role'];
                $fields['store_id'] = $this->primaryStore($data);
                $user->extraStores()->sync($this->extraStores($data));
            }
            if (! empty($data['password'])) {
                $fields['password'] = $data['password'];
            }
            $user->update($fields);
            Audit::log('UPDATE', 'users', $user->id, "Modification du compte {$user->email}");
        });

        return response()->json(Present::user($user->fresh('extraStores')));
    }

    public function setActive(Request $request, string $id): JsonResponse
    {
        $me = $request->user();
        Permissions::require($me, 'users.manage');
        $active = (bool) $request->validate(['is_active' => 'required|boolean'])['is_active'];
        $user = User::whereKey($id)->whereNull('deleted_at')->firstOrFail();
        if ($user->id === $me->id) {
            throw new BusinessException('Vous ne pouvez pas désactiver votre propre compte.');
        }
        if (! $active && $user->role_id === 'super_admin' && $this->otherSuperAdmins($user) === 0) {
            throw new BusinessException('Impossible de désactiver le dernier Super Admin.');
        }
        $user->update(['is_active' => $active]);
        if (! $active) {
            $user->tokens()->delete();
        }
        Audit::log($active ? 'ENABLE' : 'DISABLE', 'users', $user->id, ($active ? 'Réactivation' : 'Désactivation')." de {$user->email}");

        return response()->json(null, 204);
    }

    /** Suppression logique : connexion bloquée, email libéré, historique conservé. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $me = $request->user();
        Permissions::require($me, 'users.manage');
        $user = User::whereKey($id)->whereNull('deleted_at')->firstOrFail();
        if ($user->id === $me->id) {
            throw new BusinessException('Vous ne pouvez pas supprimer votre propre compte.');
        }
        if ($user->role_id === 'super_admin' && $user->is_active && $this->otherSuperAdmins($user) === 0) {
            throw new BusinessException('Impossible de supprimer le dernier Super Admin.');
        }

        DB::transaction(function () use ($user) {
            $email = $user->email;
            $user->tokens()->delete();
            $user->extraStores()->detach();
            Store::where('manager_id', $user->id)->update(['manager_id' => null]);
            $user->update([
                'is_active' => false,
                'deleted_at' => now(),
                'email' => 'supprime-'.substr($user->id, -12).'@supprime.local',
            ]);
            Audit::log('DELETE', 'users', $user->id, "Suppression du compte {$email} (historique conservé)");
        });

        return response()->json(null, 204);
    }

    private function validated(Request $request, ?User $user): array
    {
        $creating = $user === null;

        return $request->validate([
            'first_name' => [$creating ? 'required' : 'sometimes', 'string', 'max:100'],
            'last_name' => [$creating ? 'required' : 'sometimes', 'string', 'max:100'],
            'email' => [$creating ? 'required' : 'sometimes', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($user?->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => [$creating ? 'required' : 'sometimes', Rule::in(Permissions::ROLES)],
            'store_id' => ['nullable', 'uuid', Rule::exists('stores', 'id')->whereNull('deleted_at')],
            'store_ids' => ['nullable', 'array'],
            'store_ids.*' => ['uuid', Rule::exists('stores', 'id')->whereNull('deleted_at')],
            'password' => [$creating ? 'required' : 'nullable', 'string', PasswordRule::min(8)],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'email.unique' => 'Cet email est déjà utilisé.',
            'password.min' => 'Mot de passe : 8 caractères minimum.',
        ]);
    }

    /** Super Admin et Gestionnaire Stock couvrent tout le réseau : pas de boutique principale. */
    private function primaryStore(array $data): ?string
    {
        if (in_array($data['role'] ?? null, ['super_admin', 'stock_manager'], true)) {
            return null;
        }
        if (empty($data['store_id'])) {
            throw new BusinessException('La boutique principale est obligatoire pour ce rôle.');
        }

        return $data['store_id'];
    }

    /** Boutiques supplémentaires : seulement pour l'Admin Boutique et le Chef de Pôle. */
    private function extraStores(array $data): array
    {
        return in_array($data['role'] ?? null, ['store_admin', 'pole_chief'], true) ? array_values($data['store_ids'] ?? []) : [];
    }

    private function otherSuperAdmins(User $user): int
    {
        return User::where('role_id', 'super_admin')->where('is_active', true)->whereNull('deleted_at')->where('id', '!=', $user->id)->count();
    }
}
