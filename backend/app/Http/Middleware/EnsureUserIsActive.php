<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Un compte désactivé ou supprimé perd l'accès immédiatement, même avec un jeton valide. */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! $user->isUsable()) {
            $user?->currentAccessToken()?->delete();

            return response()->json(['message' => 'Compte désactivé. Contactez votre administrateur.'], 401);
        }

        return $next($request);
    }
}
