<?php

use Illuminate\Support\Facades\Route;

// Répond seulement si l'application React n'est pas déposée dans public/ (index.html absent).
Route::get('/', fn () => response()->json([
    'app' => config('app.name'),
    'api' => url('/api'),
    'frontend' => config('mm.frontend_url'),
]));
