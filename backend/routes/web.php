<?php

use Illuminate\Support\Facades\Route;

// Ce serveur n'héberge que l'API : l'application s'ouvre sur le site du frontend.
Route::get('/', fn () => response()->json([
    'app' => config('app.name'),
    'api' => url('/api'),
    'frontend' => config('mm.frontend_url'),
]));
