<?php

namespace App\Support;

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DailyReport;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use DateTimeInterface;

/**
 * Format JSON des réponses, identique aux types TypeScript du frontend
 * (frontend/src/types/index.ts) : snake_case, dates ISO 8601, montants numériques.
 */
final class Present
{
    public static function dt(?DateTimeInterface $d): ?string
    {
        return $d?->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function user(User $u): array
    {
        $extra = $u->relationLoaded('extraStores') ? $u->extraStores : $u->extraStores()->get();

        return [
            'id' => $u->id,
            'first_name' => $u->first_name,
            'last_name' => $u->last_name,
            'email' => $u->email,
            'phone' => $u->phone,
            'role' => $u->role_id,
            'store_id' => $u->store_id,
            'store_ids' => $extra->pluck('id')->values()->all(),
            'is_active' => (bool) $u->is_active,
            'last_login_at' => self::dt($u->last_login_at),
            'created_at' => self::dt($u->created_at),
            'deleted_at' => self::dt($u->deleted_at),
        ];
    }

    public static function store(Store $s): array
    {
        return [
            'id' => $s->id,
            'code' => $s->code,
            'name' => $s->name,
            'address' => $s->address,
            'phone' => $s->phone,
            'email' => $s->email,
            'region' => $s->region,
            'manager_id' => $s->manager_id,
            'is_active' => (bool) $s->is_active,
            'created_at' => self::dt($s->created_at),
            'deleted_at' => self::dt($s->deleted_at),
        ];
    }

    public static function category(Category $c): array
    {
        return ['id' => $c->id, 'name' => $c->name, 'code' => $c->code, 'parent_id' => $c->parent_id];
    }

    public static function supplier(Supplier $s): array
    {
        return [
            'id' => $s->id, 'name' => $s->name, 'contact_name' => $s->contact_name,
            'phone' => $s->phone, 'email' => $s->email, 'address' => $s->address,
        ];
    }

    public static function product(Product $p): array
    {
        return [
            'id' => $p->id,
            'sku' => $p->sku,
            'barcode' => $p->barcode,
            'name' => $p->name,
            'brand' => $p->brand,
            'description' => $p->description ?? '',
            'packaging' => $p->packaging,
            'category_id' => $p->category_id,
            'supplier_id' => $p->supplier_id,
            'purchase_price' => (float) $p->purchase_price,
            'selling_price' => (float) $p->selling_price,
            'vat_rate' => (float) $p->vat_rate,
            'min_stock_level' => (int) $p->min_stock_level,
            'image_url' => $p->image_url,
            'is_active' => (bool) $p->is_active,
            'created_at' => self::dt($p->created_at),
        ];
    }

    public static function inventory(InventoryItem $i): array
    {
        return [
            'id' => $i->id,
            'store_id' => $i->store_id,
            'product_id' => $i->product_id,
            'quantity' => (int) $i->quantity,
            'min_stock_level' => $i->min_stock_level,
            'updated_at' => self::dt($i->updated_at),
        ];
    }

    public static function movement(StockMovement $m): array
    {
        return [
            'id' => $m->id,
            'product_id' => $m->product_id,
            'store_id' => $m->store_id,
            'user_id' => $m->user_id,
            'type' => $m->type,
            'quantity' => (int) $m->quantity,
            'reason' => $m->reason,
            'lot_number' => $m->lot_number,
            'expiry_date' => $m->expiry_date?->format('Y-m-d'),
            'reference' => $m->reference,
            'created_at' => self::dt($m->created_at),
        ];
    }

    public static function transfer(StockTransfer $t): array
    {
        return [
            'id' => $t->id,
            'reference' => $t->reference,
            'source_store_id' => $t->source_store_id,
            'dest_store_id' => $t->dest_store_id,
            'status' => $t->status,
            'notes' => $t->notes,
            'created_by' => $t->created_by,
            'received_by' => $t->received_by,
            'created_at' => self::dt($t->created_at),
            'received_at' => self::dt($t->received_at),
            'items' => $t->items->map(fn ($i) => ['product_id' => $i->product_id, 'quantity' => (int) $i->quantity])->values()->all(),
        ];
    }

    public static function sale(Sale $s): array
    {
        return [
            'id' => $s->id,
            'reference' => $s->reference,
            'store_id' => $s->store_id,
            'cashier_id' => $s->cashier_id,
            'subtotal' => (float) $s->subtotal,
            'discount_amount' => (float) $s->discount_amount,
            'tax_amount' => (float) $s->tax_amount,
            'total' => (float) $s->total,
            'status' => $s->status,
            'created_at' => self::dt($s->created_at),
            'items' => $s->items->map(fn ($i) => [
                'product_id' => $i->product_id,
                'product_name' => $i->product_name,
                'quantity' => (int) $i->quantity,
                'unit_price' => (float) $i->unit_price,
                'purchase_price' => (float) $i->purchase_price,
                'vat_rate' => (float) $i->vat_rate,
                'line_total' => (float) $i->line_total,
            ])->values()->all(),
            'payments' => $s->payments->map(fn ($p) => [
                'method' => $p->method,
                'provider' => $p->provider,
                'amount' => (float) $p->amount,
                'amount_received' => $p->amount_received === null ? null : (float) $p->amount_received,
                'change_given' => $p->change_given === null ? null : (float) $p->change_given,
            ])->values()->all(),
        ];
    }

    public static function report(DailyReport $r): array
    {
        return [
            'id' => $r->id,
            'store_id' => $r->store_id,
            'user_id' => $r->user_id,
            'report_date' => $r->report_date->format('Y-m-d'),
            'theoretical_amount' => (float) $r->theoretical_amount,
            'declared_amount' => (float) $r->declared_amount,
            'expenses_total' => (float) $r->expenses_total,
            'variance' => (float) $r->variance,
            'variance_pct' => (float) $r->variance_pct,
            'status' => $r->status,
            'notes' => $r->notes,
            'rejection_reason' => $r->rejection_reason,
            'validated_by' => $r->validated_by,
            'validated_at' => self::dt($r->validated_at),
            'created_at' => self::dt($r->created_at),
            'expenses' => $r->expenses->map(fn ($e) => [
                'id' => $e->id, 'label' => $e->label, 'category' => $e->category, 'amount' => (float) $e->amount,
            ])->values()->all(),
        ];
    }

    public static function notification(AppNotification $n, bool $read): array
    {
        return [
            'id' => $n->id,
            'user_id' => $n->user_id,
            'store_id' => $n->store_id,
            'target_roles' => $n->target_roles,
            'type' => $n->type,
            'title' => $n->title,
            'message' => $n->message,
            'severity' => $n->severity,
            'read' => $read,
            'created_at' => self::dt($n->created_at),
        ];
    }

    public static function audit(AuditLog $a): array
    {
        return [
            'id' => $a->id,
            'user_id' => $a->user_id,
            'action' => $a->action,
            'entity' => $a->entity,
            'entity_id' => $a->entity_id,
            'details' => $a->details,
            'created_at' => self::dt($a->created_at),
        ];
    }
}
