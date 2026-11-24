<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\DailyReportController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\StoreController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
| API de MM Cosmétiques Stock Pro — préfixe /api.
| Contrat identique à frontend/src/data/laravelApi.ts.
*/

Route::get('/health', fn () => ['status' => 'ok', 'app' => config('app.name')]);

// Accès public, limité contre les tentatives répétées
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);
});

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::put('/auth/password', [AuthController::class, 'updatePassword']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::post('/auth/verify-supervisor', [AuthController::class, 'verifySupervisor'])->middleware('throttle:10,1');

    Route::get('/stores', [StoreController::class, 'index']);
    Route::post('/stores', [StoreController::class, 'store']);
    Route::put('/stores/{id}', [StoreController::class, 'update']);
    Route::delete('/stores/{id}', [StoreController::class, 'destroy']);

    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::patch('/users/{id}/active', [UserController::class, 'setActive']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);

    Route::get('/categories', [CatalogController::class, 'categories']);
    Route::post('/categories', [CatalogController::class, 'saveCategory']);
    Route::put('/categories/{id}', [CatalogController::class, 'saveCategory']);
    Route::delete('/categories/{id}', [CatalogController::class, 'deleteCategory']);
    Route::get('/suppliers', [CatalogController::class, 'suppliers']);
    Route::post('/suppliers', [CatalogController::class, 'saveSupplier']);
    Route::put('/suppliers/{id}', [CatalogController::class, 'saveSupplier']);
    Route::delete('/suppliers/{id}', [CatalogController::class, 'deleteSupplier']);
    Route::get('/products', [CatalogController::class, 'products']);
    Route::post('/products/image', [CatalogController::class, 'uploadImage']);
    Route::post('/products', [CatalogController::class, 'saveProduct']);
    Route::put('/products/{id}', [CatalogController::class, 'saveProduct']);

    Route::get('/inventory', [StockController::class, 'inventory']);
    Route::patch('/inventory/min-level', [StockController::class, 'setMinLevel']);
    Route::get('/movements', [StockController::class, 'movements']);
    Route::post('/stock/entries', [StockController::class, 'entry']);
    Route::post('/stock/adjustments', [StockController::class, 'adjust']);

    Route::get('/transfers', [TransferController::class, 'index']);
    Route::post('/transfers', [TransferController::class, 'store']);
    Route::post('/transfers/{id}/receive', [TransferController::class, 'receive']);
    Route::post('/transfers/{id}/cancel', [TransferController::class, 'cancel']);

    Route::get('/sales', [SaleController::class, 'index']);
    Route::post('/sales', [SaleController::class, 'store']);

    Route::get('/daily-reports', [DailyReportController::class, 'index']);
    Route::get('/daily-reports/theoretical', [DailyReportController::class, 'theoretical']);
    Route::post('/daily-reports', [DailyReportController::class, 'save']);
    Route::post('/daily-reports/{id}/submit', [DailyReportController::class, 'submit']);
    Route::post('/daily-reports/{id}/validate', [DailyReportController::class, 'validateReport']);
    Route::post('/daily-reports/{id}/reject', [DailyReportController::class, 'reject']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

    Route::get('/audit-logs', [AuditController::class, 'index']);
});
