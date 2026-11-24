<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class InventoryItem extends Model
{
    use HasUuids;

    protected $table = 'inventory';

    const CREATED_AT = null;

    protected $fillable = ['store_id', 'product_id', 'quantity', 'min_stock_level'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'min_stock_level' => 'integer'];
    }
}
