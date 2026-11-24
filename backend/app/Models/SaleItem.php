<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['sale_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'purchase_price', 'vat_rate', 'line_total'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'unit_price' => 'float', 'purchase_price' => 'float', 'vat_rate' => 'float', 'line_total' => 'float'];
    }
}
