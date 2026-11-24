<?php

namespace App\Models\Concerns;

use LogicException;

/** Journal inaltérable : une ligne enregistrée ne peut être ni modifiée ni supprimée. */
trait Immutable
{
    protected static function bootImmutable(): void
    {
        static::updating(fn () => throw new LogicException('Journal inaltérable : modification interdite.'));
        static::deleting(fn () => throw new LogicException('Journal inaltérable : suppression interdite.'));
    }
}
