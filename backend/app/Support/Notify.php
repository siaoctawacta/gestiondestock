<?php

namespace App\Support;

use App\Models\AppNotification;

/** Alertes in-app (stock, transferts, déclarations, écarts de caisse). */
final class Notify
{
    public const STOCK_ROLES = ['super_admin', 'store_admin', 'store_manager', 'stock_manager'];

    public const ADMIN_ROLES = ['super_admin', 'store_admin'];

    /** @param array<string>|null $roles */
    public static function send(string $type, string $severity, string $title, string $message, ?string $storeId, ?array $roles, ?string $userId = null): void
    {
        AppNotification::create([
            'type' => $type,
            'severity' => $severity,
            'title' => $title,
            'message' => $message,
            'store_id' => $storeId,
            'target_roles' => $roles,
            'user_id' => $userId,
        ]);
    }
}
