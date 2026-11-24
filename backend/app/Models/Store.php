<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Store extends Model
{
    use HasUuids;

    protected $attributes = ['is_active' => true];

    protected $fillable = ['code', 'name', 'address', 'phone', 'email', 'region', 'manager_id', 'is_active', 'deleted_at'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'deleted_at' => 'datetime'];
    }
}
