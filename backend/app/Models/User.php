<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasUuids, Notifiable;

    protected $fillable = [
        'first_name', 'last_name', 'email', 'phone', 'password', 'role_id', 'store_id', 'is_active', 'last_login_at', 'deleted_at',
    ];

    protected $hidden = ['password', 'remember_token'];

    /** Valeurs par défaut, alignées sur la base (un compte créé est actif). */
    protected $attributes = ['is_active' => true, 'role_id' => 'cashier'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Boutiques supplémentaires (Admin Boutique, Chef de Pôle). */
    public function extraStores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class, 'user_stores');
    }

    public function isUsable(): bool
    {
        return $this->is_active && $this->deleted_at === null;
    }

    /** Lien de réinitialisation : pointe vers la page /reset-password du frontend. */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new \App\Notifications\ResetPasswordLink($token));
    }
}
