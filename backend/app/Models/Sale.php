<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use HasUuids;

    const UPDATED_AT = null;

    protected $fillable = [
        'reference', 'store_id', 'cashier_id', 'supervisor_id', 'subtotal', 'discount_amount', 'tax_amount', 'total', 'status',
    ];

    protected function casts(): array
    {
        return ['subtotal' => 'float', 'discount_amount' => 'float', 'tax_amount' => 'float', 'total' => 'float'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
