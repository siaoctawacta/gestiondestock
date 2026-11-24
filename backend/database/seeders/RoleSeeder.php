<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['super_admin', 'Super Admin', 1],
            ['store_admin', 'Admin Boutique', 2],
            ['store_manager', 'Responsable Boutique', 3],
            ['pole_chief', 'Chef de Pôle', 4],
            ['cashier', 'Caissier', 5],
            ['stock_manager', 'Gestionnaire Stock', 6],
        ];
        foreach ($roles as [$id, $label, $level]) {
            DB::table('roles')->updateOrInsert(['id' => $id], ['label' => $label, 'level' => $level]);
        }
    }
}
