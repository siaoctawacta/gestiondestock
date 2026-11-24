<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\DemoCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Règles métier et sécurité de l'API : mêmes scénarios que les tests du frontend
 * (frontend/src/__tests__/rls.test.ts) et que les tests pgTAP de backend-supabase.
 */
class StockProTest extends TestCase
{
    use RefreshDatabase;

    private Store $agb;

    private Store $cac;

    /** @var array<string, User> */
    private array $u = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoCatalogSeeder::class);
        $this->agb = Store::where('code', 'BTQ-AGB')->firstOrFail();
        $this->cac = Store::where('code', 'BTQ-CAC')->firstOrFail();

        $mk = fn (string $key, string $role, ?Store $store, array $extra = []) => $this->u[$key] = tap(User::create([
            'first_name' => ucfirst($key), 'last_name' => 'Test', 'email' => "{$key}@test.tg",
            'password' => 'motdepasse', 'role_id' => $role, 'store_id' => $store?->id,
        ]), fn (User $user) => $user->extraStores()->sync(array_map(fn ($s) => $s->id, $extra)));

        $mk('admin', 'super_admin', null);
        $mk('storeadmin', 'store_admin', $this->agb, [$this->agb, $this->cac]);
        $mk('respagb', 'store_manager', $this->agb);
        $mk('respcac', 'store_manager', $this->cac);
        $mk('pole', 'pole_chief', $this->agb, [$this->agb, $this->cac]);
        $mk('caisseagb', 'cashier', $this->agb);
        $mk('caissecac', 'cashier', $this->cac);
        $mk('stock', 'stock_manager', null);
    }

    private function as(string $key): self
    {
        Sanctum::actingAs($this->u[$key]);

        return $this;
    }

    private function product(int $i = 0): Product
    {
        return Product::orderBy('sku')->skip($i)->firstOrFail();
    }

    private function qty(Store $s, Product $p): int
    {
        return (int) InventoryItem::where('store_id', $s->id)->where('product_id', $p->id)->value('quantity');
    }

    private function sell(Store $s, Product $p, int $q = 1, float $discount = 0, ?string $supervisor = null)
    {
        $total = $p->selling_price * $q - $discount;

        return $this->postJson('/api/sales', [
            'store_id' => $s->id, 'items' => [['product_id' => $p->id, 'quantity' => $q]], 'discount_amount' => $discount,
            'supervisor_id' => $supervisor,
            'payments' => [['method' => 'cash', 'amount' => $total, 'amount_received' => $total, 'change_given' => 0]],
        ]);
    }

    /* ------------------------------------------------------------ Authentification */

    public function test_login_returns_token_and_profile_and_rejects_bad_password(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'caisseagb@test.tg', 'password' => 'mauvais'])->assertStatus(422);
        $res = $this->postJson('/api/auth/login', ['email' => 'CaisseAgb@test.tg', 'password' => 'motdepasse'])->assertOk();
        $res->assertJsonPath('user.role', 'cashier')->assertJsonPath('user.store_id', $this->agb->id);
        $this->withToken($res->json('token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('email', 'caisseagb@test.tg');
    }

    public function test_unauthenticated_requests_get_a_json_401(): void
    {
        $this->getJson('/api/stores')->assertStatus(401)->assertJsonPath('message', 'Session expirée, veuillez vous reconnecter.');
        $this->get('/api/sales', ['Accept' => 'text/html'])->assertStatus(401);
    }

    public function test_deactivated_user_loses_access_immediately(): void
    {
        $token = $this->postJson('/api/auth/login', ['email' => 'caisseagb@test.tg', 'password' => 'motdepasse'])->json('token');
        $this->u['caisseagb']->update(['is_active' => false]);
        $this->withToken($token)->getJson('/api/auth/me')->assertStatus(401);
    }

    /* ------------------------------------------------------------ Étanchéité par boutique */

    public function test_cashier_only_sees_own_sales_in_own_store(): void
    {
        $p = $this->product();
        $this->as('caisseagb')->sell($this->agb, $p)->assertCreated();
        $this->as('caissecac')->sell($this->cac, $p)->assertCreated();

        $sales = $this->as('caisseagb')->getJson('/api/sales')->assertOk()->json();
        $this->assertCount(1, $sales);
        $this->assertSame($this->agb->id, $sales[0]['store_id']);
        $this->assertSame($this->u['caisseagb']->id, $sales[0]['cashier_id']);
    }

    public function test_store_manager_cannot_read_other_store_inventory(): void
    {
        $rows = $this->as('respagb')->getJson('/api/inventory')->assertOk()->json();
        $this->assertNotEmpty($rows);
        $this->assertEmpty(array_filter($rows, fn ($r) => $r['store_id'] !== $this->agb->id));
    }

    public function test_cashier_cannot_sell_for_another_store(): void
    {
        $this->as('caisseagb')->sell($this->cac, $this->product())->assertStatus(403);
    }

    public function test_stock_manager_sees_whole_network_but_no_sales(): void
    {
        $stores = collect($this->as('stock')->getJson('/api/inventory')->json())->pluck('store_id')->unique();
        $this->assertCount(2, $stores);
        $this->getJson('/api/sales')->assertStatus(403);
    }

    /* ------------------------------------------------------------ Caisse */

    public function test_sale_totals_are_computed_server_side_and_stock_decrements(): void
    {
        $p = $this->product(1);
        $before = $this->qty($this->agb, $p);
        $res = $this->as('caisseagb')->sell($this->agb, $p, 2)->assertCreated();

        $this->assertEquals($p->selling_price * 2, $res->json('subtotal'));
        $this->assertEquals($p->selling_price * 2, $res->json('total'));
        $this->assertEquals(round($p->selling_price * 2 * 18 / 118), $res->json('tax_amount'));
        $this->assertStringStartsWith('TK-AGB-', $res->json('reference'));
        $this->assertSame($before - 2, $this->qty($this->agb, $p));
        $mv = $this->as('stock')->getJson('/api/movements?limit=1')->json()[0];
        $this->assertSame(['sale', -2, $p->id], [$mv['type'], $mv['quantity'], $mv['product_id']]);
    }

    public function test_paid_amount_must_match_total(): void
    {
        $p = $this->product();
        $this->as('caisseagb')->postJson('/api/sales', [
            'store_id' => $this->agb->id, 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'payments' => [['method' => 'card', 'amount' => 1]],
        ])->assertStatus(422);
    }

    public function test_cannot_sell_more_than_stock_and_nothing_is_written(): void
    {
        $p = $this->product();
        $before = $this->qty($this->agb, $p);
        $this->as('caisseagb')->sell($this->agb, $p, $before + 1)->assertStatus(422)->assertJsonFragment(['message' => "Stock insuffisant pour « {$p->name} » (disponible : {$before})."]);
        $this->assertSame($before, $this->qty($this->agb, $p));
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_discount_above_15_percent_needs_a_supervisor(): void
    {
        $p = $this->product(2);
        $discount = round($p->selling_price * 0.2);
        $this->as('caisseagb')->sell($this->agb, $p, 1, $discount)->assertStatus(422);

        $this->postJson('/api/auth/verify-supervisor', ['email' => 'caisseagb@test.tg', 'password' => 'motdepasse'])->assertStatus(422);
        $sup = $this->postJson('/api/auth/verify-supervisor', ['email' => 'respagb@test.tg', 'password' => 'motdepasse'])->assertOk()->json();
        $sale = $this->sell($this->agb, $p, 1, $discount, $sup['id'])->assertCreated();
        $this->assertEquals($p->selling_price - $discount, $sale->json('total'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'DISCOUNT']);
    }

    /* ------------------------------------------------------------ Stock et transferts */

    public function test_stock_entry_requires_lot_and_adjustment_requires_reason(): void
    {
        $p = $this->product(3);
        $this->as('stock')->postJson('/api/stock/entries', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => 5])->assertStatus(422);
        $this->postJson('/api/stock/entries', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => 5, 'lot_number' => 'LOT-1', 'expiry_date' => '2027-12-31'])->assertCreated();
        $this->assertSame(55, $this->qty($this->agb, $p));
        $this->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => -2])->assertStatus(422);
        $this->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => -2, 'reason' => 'breakage'])->assertCreated();
        $this->assertSame(53, $this->qty($this->agb, $p));
        $this->as('caisseagb')->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => -1, 'reason' => 'theft'])->assertStatus(403);
    }

    public function test_low_stock_and_out_of_stock_alerts(): void
    {
        $p = $this->product(4);
        $this->as('stock')->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => -46, 'reason' => 'inventory'])->assertCreated();
        $this->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $p->id, 'quantity' => -4, 'reason' => 'inventory'])->assertCreated();
        $types = collect($this->as('respagb')->getJson('/api/notifications')->json())->pluck('type');
        $this->assertTrue($types->contains('low_stock'));
        $this->assertTrue($types->contains('out_of_stock'));
        // Les alertes d'Agbalépédo ne sont pas visibles par le responsable de Cacaveli
        $this->assertEmpty($this->as('respcac')->getJson('/api/notifications')->json());
    }

    public function test_transfer_is_reserved_then_moved_atomically_on_reception(): void
    {
        $p = $this->product(5);
        $t = $this->as('stock')->postJson('/api/transfers', [
            'source_store_id' => $this->agb->id, 'dest_store_id' => $this->cac->id, 'items' => [['product_id' => $p->id, 'quantity' => 30]],
        ])->assertCreated()->json();
        $this->assertSame(50, $this->qty($this->agb, $p)); // en transit : pas encore débité
        // Réservé : un second transfert de 30 dépasserait le disponible (50 − 30)
        $this->postJson('/api/transfers', [
            'source_store_id' => $this->agb->id, 'dest_store_id' => $this->cac->id, 'items' => [['product_id' => $p->id, 'quantity' => 30]],
        ])->assertStatus(422);

        $this->as('respagb')->postJson("/api/transfers/{$t['id']}/receive")->assertStatus(403); // hors boutique destinataire
        $this->as('respcac')->postJson("/api/transfers/{$t['id']}/receive")->assertNoContent();
        $this->assertSame([20, 80], [$this->qty($this->agb, $p), $this->qty($this->cac, $p)]);
        $this->postJson("/api/transfers/{$t['id']}/receive")->assertStatus(422); // déjà reçu
    }

    /* ------------------------------------------------------------ Déclarations */

    public function test_daily_report_workflow_and_variance(): void
    {
        $p = $this->product(6);
        $this->as('caisseagb')->sell($this->agb, $p, 2)->assertCreated();
        $today = now()->format('Y-m-d');
        $expected = $p->selling_price * 2;

        $this->assertEquals($expected, $this->as('pole')->getJson("/api/daily-reports/theoretical?store_id={$this->agb->id}&date={$today}")->json('amount'));
        $this->postJson('/api/daily-reports', ['store_id' => $this->agb->id, 'report_date' => $today, 'declared_amount' => -4500])->assertStatus(422);
        $r = $this->postJson('/api/daily-reports', [
            'store_id' => $this->agb->id, 'report_date' => $today, 'declared_amount' => $expected - 3000 - 1000,
            'expenses' => [['label' => 'Transport', 'category' => 'Transport', 'amount' => 3000]],
        ])->assertOk()->assertJsonPath('status', 'draft')->json();
        $this->assertEquals(-1000, $r['variance']);
        $this->postJson("/api/daily-reports/{$r['id']}/submit")->assertNoContent();
        $this->postJson("/api/daily-reports/{$r['id']}/validate")->assertStatus(403); // le Chef de Pôle ne valide pas

        $this->as('admin')->postJson("/api/daily-reports/{$r['id']}/reject", ['reason' => ''])->assertStatus(422);
        $this->postJson("/api/daily-reports/{$r['id']}/reject", ['reason' => 'Recompter le coffre'])->assertNoContent();
        $this->assertSame('rejected', $this->getJson('/api/daily-reports')->json('0.status'));
        $this->assertContains('report_status', collect($this->as('pole')->getJson('/api/notifications')->json())->pluck('type'));
    }

    /* ------------------------------------------------------------ Administration (Super Admin) */

    public function test_store_admin_cannot_manage_stores_or_users(): void
    {
        $this->as('storeadmin');
        $this->postJson('/api/stores', ['name' => 'X', 'code' => 'BTQ-X'])->assertStatus(403);
        $this->putJson("/api/stores/{$this->agb->id}", ['name' => 'Renommée'])->assertStatus(403);
        $this->deleteJson("/api/stores/{$this->agb->id}")->assertStatus(403);
        $this->postJson('/api/users', ['first_name' => 'A', 'last_name' => 'B', 'email' => 'x@y.tg', 'role' => 'cashier', 'store_id' => $this->agb->id, 'password' => 'motdepasse'])->assertStatus(403);
        $this->deleteJson("/api/users/{$this->u['caisseagb']->id}")->assertStatus(403);
        $this->getJson('/api/users')->assertOk(); // lecture des noms autorisée
    }

    public function test_super_admin_deletes_user_softly_and_email_becomes_reusable(): void
    {
        $target = $this->u['caisseagb'];
        $this->as('caisseagb')->sell($this->agb, $this->product())->assertCreated();
        $this->as('admin')->deleteJson("/api/users/{$target->id}")->assertNoContent();
        $this->postJson('/api/auth/login', ['email' => 'caisseagb@test.tg', 'password' => 'motdepasse'])->assertStatus(422);
        $this->assertDatabaseHas('sales', ['cashier_id' => $target->id]);
        $this->as('admin')->postJson('/api/users', [
            'first_name' => 'Nouvelle', 'last_name' => 'Caissière', 'email' => 'caisseagb@test.tg', 'role' => 'cashier',
            'store_id' => $this->agb->id, 'password' => 'motdepasse',
        ])->assertCreated();
    }

    public function test_last_super_admin_and_own_account_are_protected(): void
    {
        $me = $this->u['admin'];
        $this->as('admin')->deleteJson("/api/users/{$me->id}")->assertStatus(422);
        $this->putJson("/api/users/{$me->id}", ['role' => 'cashier', 'store_id' => $this->agb->id])->assertStatus(422);
    }

    public function test_store_deletion_requires_empty_store_and_keeps_sales(): void
    {
        $this->as('caissecac')->sell($this->cac, $this->product())->assertCreated();
        $t = $this->as('stock')->postJson('/api/transfers', [
            'source_store_id' => $this->agb->id, 'dest_store_id' => $this->cac->id, 'items' => [['product_id' => $this->product(7)->id, 'quantity' => 1]],
        ])->json();

        $this->as('admin')->deleteJson("/api/stores/{$this->cac->id}")->assertStatus(422)->assertJsonFragment(['message' => 'Des transferts sont en transit avec cette boutique : réceptionnez-les ou annulez-les d’abord.']);
        $this->postJson("/api/transfers/{$t['id']}/cancel")->assertNoContent();
        $this->deleteJson("/api/stores/{$this->cac->id}")->assertStatus(422);
        foreach (['respcac', 'caissecac'] as $k) {
            $this->deleteJson("/api/users/{$this->u[$k]->id}")->assertNoContent();
        }
        $this->deleteJson("/api/stores/{$this->cac->id}")->assertNoContent();
        $this->assertNotNull($this->cac->fresh()->deleted_at);
        $this->assertDatabaseHas('sales', ['store_id' => $this->cac->id]);
        $this->postJson('/api/stores', ['name' => 'MM Cosmétiques Cacaveli II', 'code' => 'BTQ-CAC'])->assertCreated();
    }

    public function test_movement_and_audit_logs_are_immutable(): void
    {
        $this->as('stock')->postJson('/api/stock/adjustments', ['store_id' => $this->agb->id, 'product_id' => $this->product()->id, 'quantity' => -1, 'reason' => 'tester'])->assertCreated();
        $this->expectException(\LogicException::class);
        \App\Models\StockMovement::firstOrFail()->update(['quantity' => 999]);
    }

    public function test_product_creation_generates_sku_and_validates_ean13(): void
    {
        $cat = \App\Models\Category::where('code', 'PAR')->firstOrFail();
        $base = ['name' => 'Parfum test', 'category_id' => $cat->id, 'purchase_price' => 1000, 'selling_price' => 2000];
        $this->as('stock')->postJson('/api/products', $base + ['barcode' => '4006381333932'])->assertStatus(422);
        $res = $this->postJson('/api/products', $base + ['barcode' => '4006381333931'])->assertCreated();
        $this->assertMatchesRegularExpression('/^COSM-PAR-\d{4}$/', $res->json('sku'));
        $this->assertSame(0, $this->qty($this->agb, Product::find($res->json('id'))));
        $this->as('caisseagb')->postJson('/api/products', $base)->assertStatus(403);
    }
}
