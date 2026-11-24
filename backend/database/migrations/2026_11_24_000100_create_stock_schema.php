<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catalogue, stocks, transferts, ventes, déclarations, notifications et audit.
 * Les montants sont en XOF (decimal 12,2). Les écritures de stock passent
 * exclusivement par les services de l'application (verrous de ligne + transactions).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->string('code', 3)->unique();
            $table->uuid('parent_id')->nullable();
            $table->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('contact_name')->default('');
            $table->string('phone', 50)->default('');
            $table->string('email')->default('');
            $table->string('address')->default('');
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('sku', 50)->unique();
            $table->string('barcode', 100)->nullable()->unique();
            $table->string('name');
            $table->string('brand', 100)->default('');
            $table->text('description')->nullable();
            $table->string('packaging', 100)->default('');
            $table->foreignUuid('category_id')->nullable()->constrained('categories');
            $table->foreignUuid('supplier_id')->nullable()->constrained('suppliers');
            $table->decimal('purchase_price', 12, 2);
            $table->decimal('selling_price', 12, 2);
            $table->decimal('vat_rate', 5, 2)->default(18);
            $table->unsignedInteger('min_stock_level')->default(5);
            $table->string('image_url')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('inventory', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(0);
            $table->unsignedInteger('min_stock_level')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['store_id', 'product_id']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products');
            $table->foreignUuid('store_id')->constrained('stores');
            $table->foreignUuid('user_id')->nullable()->constrained('users');
            $table->enum('type', ['entry', 'sale', 'adjustment', 'transfer_out', 'transfer_in']);
            $table->integer('quantity');
            $table->string('reason')->nullable();
            $table->string('lot_number', 100)->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('reference', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['store_id', 'created_at']);
        });

        Schema::create('stock_transfers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference', 30)->unique();
            $table->foreignUuid('source_store_id')->constrained('stores');
            $table->foreignUuid('dest_store_id')->constrained('stores');
            $table->enum('status', ['in_transit', 'received', 'cancelled'])->default('in_transit');
            $table->text('notes')->nullable();
            $table->foreignUuid('created_by')->constrained('users');
            $table->foreignUuid('received_by')->nullable()->constrained('users');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('received_at')->nullable();
        });

        Schema::create('transfer_items', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('transfer_id')->constrained('stock_transfers')->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('products');
            $table->unsignedInteger('quantity');
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference', 30)->unique();
            $table->foreignUuid('store_id')->constrained('stores');
            $table->foreignUuid('cashier_id')->constrained('users');
            $table->foreignUuid('supervisor_id')->nullable()->constrained('users');
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('tax_amount', 12, 2);
            $table->decimal('total', 12, 2);
            $table->enum('status', ['completed', 'refunded'])->default('completed');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['store_id', 'created_at']);
            $table->index('cashier_id');
        });

        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('products');
            $table->string('product_name');
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 12, 2);
            $table->decimal('purchase_price', 12, 2);
            $table->decimal('vat_rate', 5, 2);
            $table->decimal('line_total', 12, 2);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->enum('method', ['cash', 'mobile_money', 'card']);
            $table->enum('provider', ['wave', 'orange_money', 'mtn'])->nullable();
            $table->decimal('amount', 12, 2);
            $table->decimal('amount_received', 12, 2)->nullable();
            $table->decimal('change_given', 12, 2)->nullable();
        });

        Schema::create('daily_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('store_id')->constrained('stores');
            $table->foreignUuid('user_id')->constrained('users');
            $table->date('report_date');
            $table->decimal('theoretical_amount', 12, 2)->default(0);
            $table->decimal('declared_amount', 12, 2)->default(0);
            $table->decimal('expenses_total', 12, 2)->default(0);
            $table->decimal('variance', 12, 2)->default(0);
            $table->decimal('variance_pct', 7, 2)->default(0);
            $table->enum('status', ['draft', 'submitted', 'validated', 'rejected'])->default('draft');
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignUuid('validated_by')->nullable()->constrained('users');
            $table->timestamp('validated_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['store_id', 'report_date']);
        });

        Schema::create('report_expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('daily_report_id')->constrained('daily_reports')->cascadeOnDelete();
            $table->string('label');
            $table->string('category', 100)->default('Divers');
            $table->decimal('amount', 12, 2);
        });

        // « app_notifications » : le nom « notifications » est réservé par Laravel.
        Schema::create('app_notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            $table->json('target_roles')->nullable();
            $table->string('type', 30);
            $table->enum('severity', ['info', 'warning', 'critical'])->default('info');
            $table->string('title');
            $table->text('message');
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('notification_reads', function (Blueprint $table) {
            $table->foreignUuid('notification_id')->constrained('app_notifications')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('read_at')->useCurrent();
            $table->primary(['notification_id', 'user_id']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 30);
            $table->string('entity', 50);
            $table->string('entity_id', 36)->nullable();
            $table->text('details')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('counters', function (Blueprint $table) {
            // Numérotation des tickets et des bons de transfert (TK-AGB-000123, TRF-000045)
            $table->string('name', 30)->primary();
            $table->unsignedBigInteger('value')->default(0);
        });
    }

    public function down(): void
    {
        foreach (['counters', 'audit_logs', 'notification_reads', 'app_notifications', 'report_expenses', 'daily_reports',
            'payments', 'sale_items', 'sales', 'transfer_items', 'stock_transfers', 'stock_movements', 'inventory',
            'products', 'suppliers', 'categories'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
