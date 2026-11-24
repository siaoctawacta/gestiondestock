<?php

namespace App\Models;

use App\Models\Concerns\Immutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use HasUuids, Immutable;

    const UPDATED_AT = null;

    protected $fillable = ['product_id', 'store_id', 'user_id', 'type', 'quantity', 'reason', 'lot_number', 'expiry_date', 'reference'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'expiry_date' => 'date:Y-m-d'];
    }
}
