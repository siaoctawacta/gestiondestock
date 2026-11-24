<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DailyReport extends Model
{
    use HasUuids;

    const UPDATED_AT = null;

    protected $fillable = [
        'store_id', 'user_id', 'report_date', 'theoretical_amount', 'declared_amount', 'expenses_total', 'variance',
        'variance_pct', 'status', 'notes', 'rejection_reason', 'validated_by', 'validated_at',
    ];

    protected function casts(): array
    {
        return [
            'report_date' => 'date:Y-m-d',
            'theoretical_amount' => 'float',
            'declared_amount' => 'float',
            'expenses_total' => 'float',
            'variance' => 'float',
            'variance_pct' => 'float',
            'validated_at' => 'datetime',
        ];
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(ReportExpense::class);
    }
}
