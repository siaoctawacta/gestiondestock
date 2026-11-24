<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Store;
use Illuminate\Database\Seeder;

/** Boutiques et catégories réelles (data/reference.json, généré depuis le frontend). Rejouable sans doublon. */
class ReferenceSeeder extends Seeder
{
    public function run(): void
    {
        $data = json_decode(file_get_contents(__DIR__.'/data/reference.json'), true, flags: JSON_THROW_ON_ERROR);

        foreach ($data['stores'] as $s) {
            Store::query()->firstOrCreate(['id' => $s['id']], $s + ['is_active' => true]);
        }
        foreach ($data['categories'] as $c) {
            Category::query()->firstOrCreate(['code' => $c['code']], $c);
        }
    }
}
