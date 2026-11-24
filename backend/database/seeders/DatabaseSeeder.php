<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Données de départ de production : rôles, les deux boutiques MM Cosmétiques et les catégories.
 * Le catalogue de démonstration (produits fictifs) est à part : DemoCatalogSeeder.
 *   php artisan db:seed --force
 *   php artisan db:seed --class=DemoCatalogSeeder --force   (formation uniquement)
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([RoleSeeder::class, ReferenceSeeder::class]);
    }
}
