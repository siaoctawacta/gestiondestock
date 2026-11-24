<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AppNotification extends Model
{
    use HasUuids;

    const UPDATED_AT = null;

    protected $fillable = ['user_id', 'store_id', 'target_roles', 'type', 'severity', 'title', 'message'];

    protected function casts(): array
    {
        return ['target_roles' => 'array'];
    }
}
