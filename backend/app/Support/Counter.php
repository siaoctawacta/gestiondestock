<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Compteurs séquentiels (numéros de ticket et de bon de transfert), sûrs en concurrence. */
final class Counter
{
    public static function next(string $name): int
    {
        return DB::transaction(function () use ($name) {
            DB::table('counters')->insertOrIgnore(['name' => $name, 'value' => 0]);
            $row = DB::table('counters')->where('name', $name)->lockForUpdate()->first();
            $value = (int) $row->value + 1;
            DB::table('counters')->where('name', $name)->update(['value' => $value]);

            return $value;
        });
    }
}
