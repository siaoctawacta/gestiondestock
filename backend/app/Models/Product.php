<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasUuids;

    protected $attributes = ['is_active' => true, 'vat_rate' => 18, 'min_stock_level' => 5, 'brand' => '', 'packaging' => ''];

    protected $fillable = [
        'sku', 'barcode', 'name', 'brand', 'description', 'packaging', 'category_id', 'supplier_id',
        'purchase_price', 'selling_price', 'vat_rate', 'min_stock_level', 'image_url', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'purchase_price' => 'float',
            'selling_price' => 'float',
            'vat_rate' => 'float',
            'min_stock_level' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
