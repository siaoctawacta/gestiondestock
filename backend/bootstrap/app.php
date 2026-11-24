<?php

use App\Http\Middleware\EnsureUserIsActive;
use App\Services\BusinessException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias(['active' => EnsureUserIsActive::class]);
        // API sans page de connexion côté serveur : un visiteur non connecté reçoit un 401 JSON
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Réponses JSON en français pour toute l'API
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        // Refus métier attendus (stock insuffisant, remise non autorisée…) : pas des pannes
        $exceptions->dontReport(BusinessException::class);
        $exceptions->render(fn (BusinessException $e) => response()->json(['message' => $e->getMessage()], 422));
        $exceptions->render(fn (AuthorizationException $e, Request $r) => $r->is('api/*')
            ? response()->json(['message' => $e->getMessage() ?: 'Action non autorisée.'], 403) : null);
        $exceptions->render(fn (AuthenticationException $e, Request $r) => $r->is('api/*')
            ? response()->json(['message' => 'Session expirée, veuillez vous reconnecter.'], 401) : null);
        $exceptions->render(function (NotFoundHttpException $e, Request $r) {
            if ($r->is('api/*')) {
                return response()->json(['message' => $e->getPrevious() instanceof ModelNotFoundException
                    ? 'Élément introuvable.' : 'Adresse d’API inconnue.'], 404);
            }
        });
    })->create();
