<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

/**
 * Matrice des droits par rôle. Copie exacte de frontend/src/lib/permissions.ts :
 * toute modification doit être faite aux deux endroits.
 */
final class Permissions
{
    public const ROLES = ['super_admin', 'store_admin', 'store_manager', 'pole_chief', 'cashier', 'stock_manager'];

    /** Remise (en %) au-delà de laquelle un superviseur doit valider. */
    public const DISCOUNT_SUPERVISOR_THRESHOLD = 15;

    /** Tolérance d'écart de caisse (en %) avant alerte. */
    public const CASH_VARIANCE_TOLERANCE = 2;

    private const MATRIX = [
        'dashboard' => self::ROLES,
        'pos' => ['super_admin', 'store_admin', 'store_manager', 'cashier'],
        'sales.view' => ['super_admin', 'store_admin', 'store_manager', 'pole_chief', 'cashier'],
        'products.view' => self::ROLES,
        'products.edit' => ['super_admin', 'store_admin', 'stock_manager'],
        'catalog.settings' => ['super_admin', 'store_admin', 'stock_manager'],
        'inventory.view' => ['super_admin', 'store_admin', 'store_manager', 'pole_chief', 'stock_manager'],
        'inventory.move' => ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
        'inventory.adjust' => ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
        'transfers.view' => ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
        'transfers.create' => ['super_admin', 'store_admin', 'stock_manager'],
        'transfers.receive' => ['super_admin', 'store_admin', 'store_manager', 'stock_manager'],
        'reports.daily.view' => ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
        'reports.daily.edit' => ['pole_chief', 'super_admin'],
        'reports.daily.validate' => ['super_admin', 'store_admin'],
        'analytics' => ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
        'stores.view' => ['super_admin', 'store_admin', 'pole_chief'],
        'stores.edit' => ['super_admin'],
        'users.view' => ['super_admin', 'store_admin', 'store_manager', 'pole_chief'],
        'users.manage' => ['super_admin'],
        'audit' => ['super_admin'],
        'discount.approve' => ['super_admin', 'store_admin', 'store_manager'],
    ];

    public static function can(?User $user, string $permission): bool
    {
        return $user !== null && in_array($user->role_id, self::MATRIX[$permission] ?? [], true);
    }

    /** @throws AuthorizationException */
    public static function require(User $user, string $permission): void
    {
        if (! self::can($user, $permission)) {
            throw new AuthorizationException('Action non autorisée pour votre rôle.');
        }
    }

    /**
     * Boutiques accessibles. null = tout le réseau (Super Admin, Gestionnaire Stock).
     *
     * @return array<string>|null
     */
    public static function storeScope(User $user): ?array
    {
        if (in_array($user->role_id, ['super_admin', 'stock_manager'], true)) {
            return null;
        }
        $ids = $user->extraStores()->whereNull('stores.deleted_at')->pluck('stores.id')->all();
        if ($user->store_id) {
            $ids[] = $user->store_id;
        }

        return array_values(array_unique($ids));
    }

    public static function inScope(User $user, ?string $storeId): bool
    {
        $scope = self::storeScope($user);

        return $scope === null || ($storeId !== null && in_array($storeId, $scope, true));
    }

    /** @throws AuthorizationException */
    public static function requireStore(User $user, ?string $storeId): void
    {
        if (! self::inScope($user, $storeId)) {
            throw new AuthorizationException('Cette boutique est hors de votre périmètre.');
        }
    }
}
