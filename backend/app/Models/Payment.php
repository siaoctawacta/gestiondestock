<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    public $timestamps = false;

    protected $fillable = ['sale_id', 'method', 'provider', 'amount', 'amount_received', 'change_given'];

    protected function casts(): array
    {
        return ['amount' => 'float', 'amount_received' => 'float', 'change_given' => 'float'];
    }
}
