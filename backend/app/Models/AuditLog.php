<?php

namespace App\Models;

use App\Models\Concerns\Immutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasUuids, Immutable;

    const UPDATED_AT = null;

    protected $fillable = ['user_id', 'action', 'entity', 'entity_id', 'details'];
}
