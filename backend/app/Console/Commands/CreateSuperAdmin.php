<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

/**
 * Crée (ou réactive) le premier Super Admin.
 *   php artisan mm:create-admin admin@mmcosmetiques.com --first=Prénom --last=Nom
 * Le mot de passe est demandé de façon masquée, ou lu dans la variable ADMIN_PASSWORD.
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'mm:create-admin {email} {--first=Admin} {--last=MM Cosmétiques}';

    protected $description = 'Crée le premier compte Super Admin de MM Cosmétiques Stock Pro';

    public function handle(): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        $password = (string) (env('ADMIN_PASSWORD') ?: $this->secret('Mot de passe (8 caractères minimum)'));

        $v = Validator::make(['email' => $email, 'password' => $password], [
            'email' => 'required|email', 'password' => 'required|string|min:8',
        ]);
        if ($v->fails()) {
            $this->error(implode(' ', $v->errors()->all()));

            return self::FAILURE;
        }

        $user = User::firstOrNew(['email' => $email]);
        $user->fill([
            'first_name' => $user->first_name ?: (string) $this->option('first'),
            'last_name' => $user->last_name ?: (string) $this->option('last'),
            'password' => $password,
            'role_id' => 'super_admin',
            'store_id' => null,
            'is_active' => true,
            'deleted_at' => null,
        ])->save();

        $this->info("Super Admin prêt : {$email}");

        return self::SUCCESS;
    }
}
