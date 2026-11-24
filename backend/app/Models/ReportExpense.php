<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ReportExpense extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['daily_report_id', 'label', 'category', 'amount'];

    protected function casts(): array
    {
        return ['amount' => 'float'];
    }
}
