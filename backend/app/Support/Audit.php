<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;

/** Journal d'audit des actions sensibles. */
final class Audit
{
    public static function log(string $action, string $entity, ?string $entityId, ?string $details): void
    {
        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
            'details' => $details !== null ? mb_substr($details, 0, 1000) : null,
        ]);
    }
}
