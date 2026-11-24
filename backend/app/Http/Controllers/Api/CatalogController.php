<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\BusinessException;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Catégories, fournisseurs, produits et images produits. */
class CatalogController extends Controller
{
    /* ---------------- Catégories ---------------- */
    public function categories(): JsonResponse
    {
        return response()->json(Category::orderBy('name')->get()->map(fn ($c) => Present::category($c)));
    }

    public function saveCategory(Request $request, ?string $id = null): JsonResponse
    {
        Permissions::require($request->user(), 'catalog.settings');
        $cat = $id ? Category::findOrFail($id) : new Category;
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'code' => [$id ? 'sometimes' : 'required', 'string', 'size:3', 'alpha', Rule::unique('categories', 'code')->ignore($id)],
        ]);
        if (! $id) {
            $data['code'] = mb_strtoupper($data['code']);
        } else {
            unset($data['code']); // le code compose les SKU existants : il ne change plus
        }
        $cat->fill($data)->save();

        return response()->json(Present::category($cat), $id ? 200 : 201);
    }

    public function deleteCategory(Request $request, string $id): JsonResponse
    {
        Permissions::require($request->user(), 'catalog.settings');
        if (Product::where('category_id', $id)->exists()) {
            throw new BusinessException('Catégorie utilisée par des produits.');
        }
        Category::whereKey($id)->delete();

        return response()->json(null, 204);
    }

    /* ---------------- Fournisseurs ---------------- */
    public function suppliers(): JsonResponse
    {
        return response()->json(Supplier::orderBy('name')->get()->map(fn ($s) => Present::supplier($s)));
    }

    public function saveSupplier(Request $request, ?string $id = null): JsonResponse
    {
        Permissions::require($request->user(), 'catalog.settings');
        $sup = $id ? Supplier::findOrFail($id) : new Supplier;
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'contact_name' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string|max:255',
        ]);
        $sup->fill(array_map(fn ($v) => $v ?? '', $data))->save();

        return response()->json(Present::supplier($sup), $id ? 200 : 201);
    }

    public function deleteSupplier(Request $request, string $id): JsonResponse
    {
        Permissions::require($request->user(), 'catalog.settings');
        if (Product::where('supplier_id', $id)->exists()) {
            throw new BusinessException('Fournisseur associé à des produits.');
        }
        Supplier::whereKey($id)->delete();

        return response()->json(null, 204);
    }

    /* ---------------- Produits ---------------- */
    public function products(): JsonResponse
    {
        return response()->json(Product::orderBy('name')->get()->map(fn ($p) => Present::product($p)));
    }

    public function saveProduct(Request $request, ?string $id = null): JsonResponse
    {
        $user = $request->user();
        Permissions::require($user, 'products.edit');
        $product = $id ? Product::findOrFail($id) : null;

        $data = $request->validate([
            'name' => [$id ? 'sometimes' : 'required', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'packaging' => ['nullable', 'string', 'max:100'],
            'category_id' => [$id ? 'sometimes' : 'required', 'uuid', 'exists:categories,id'],
            'supplier_id' => ['nullable', 'uuid', 'exists:suppliers,id'],
            'barcode' => ['nullable', 'digits:13', Rule::unique('products', 'barcode')->ignore($id)],
            'purchase_price' => [$id ? 'sometimes' : 'required', 'numeric', 'min:0'],
            'selling_price' => [$id ? 'sometimes' : 'required', 'numeric', 'min:0'],
            'vat_rate' => ['sometimes', 'numeric', 'between:0,100'],
            'min_stock_level' => ['sometimes', 'integer', 'min:0'],
            'image_url' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], ['barcode.unique' => 'Ce code-barres est déjà attribué.', 'barcode.digits' => 'Le code-barres EAN13 doit faire 13 chiffres.']);

        if (! empty($data['barcode']) && ! self::validEan13($data['barcode'])) {
            throw new BusinessException('EAN13 invalide (clé de contrôle).');
        }
        $pa = $data['purchase_price'] ?? $product?->purchase_price;
        $pv = $data['selling_price'] ?? $product?->selling_price;
        if ($pv < $pa) {
            throw new BusinessException('Le prix de vente doit être supérieur ou égal au prix d’achat.');
        }
        foreach (['brand', 'packaging', 'description'] as $f) {
            if (array_key_exists($f, $data)) {
                $data[$f] = (string) ($data[$f] ?? '');
            }
        }

        $product = DB::transaction(function () use ($product, $data) {
            if ($product) {
                unset($data['category_id']); // la catégorie fixe le SKU
                $changes = [];
                if (isset($data['selling_price']) && (float) $data['selling_price'] !== (float) $product->selling_price) {
                    $changes[] = "Prix de vente : {$product->selling_price} → {$data['selling_price']}";
                }
                if (isset($data['purchase_price']) && (float) $data['purchase_price'] !== (float) $product->purchase_price) {
                    $changes[] = "Prix d’achat : {$product->purchase_price} → {$data['purchase_price']}";
                }
                $product->update($data);
                Audit::log('UPDATE', 'products', $product->id, $changes ? implode(' · ', $changes) : "Modification de {$product->name}");

                return $product;
            }

            $code = Category::whereKey($data['category_id'])->value('code') ?? 'GEN';
            $product = Product::create($data + ['sku' => self::nextSku($code), 'vat_rate' => 18, 'min_stock_level' => 5, 'is_active' => true]);
            $now = now();
            InventoryItem::insert(Store::pluck('id')->map(fn ($sid) => [
                'id' => (string) Str::uuid7(), 'store_id' => $sid, 'product_id' => $product->id, 'quantity' => 0, 'updated_at' => $now,
            ])->all());
            Audit::log('INSERT', 'products', $product->id, "Création de {$product->name} ({$product->sku})");

            return $product;
        });

        return response()->json(Present::product($product->fresh()), $id ? 200 : 201);
    }

    /** Image produit : enregistrée dans public/uploads/products (pas de lien symbolique requis sur cPanel). */
    public function uploadImage(Request $request): JsonResponse
    {
        Permissions::require($request->user(), 'products.edit');
        $request->validate(['image' => 'required|image|mimes:jpg,jpeg,png,webp|max:2048'], [
            'image.max' => 'Image trop lourde (2 Mo maximum).',
        ]);
        $file = $request->file('image');
        $name = Str::uuid7().'.'.$file->extension();
        $file->move(public_path('uploads/products'), $name);

        return response()->json(['url' => asset('uploads/products/'.$name)], 201);
    }

    /** SKU automatique : COSM-<CODE CATÉGORIE>-0001, séquentiel par catégorie. */
    public static function nextSku(string $code): string
    {
        $prefix = 'COSM-'.mb_strtoupper(mb_substr($code, 0, 3)).'-';
        $max = Product::where('sku', 'like', $prefix.'%')->lockForUpdate()->pluck('sku')
            ->map(fn ($s) => (int) substr($s, strlen($prefix)))->max() ?? 0;

        return $prefix.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
    }

    public static function validEan13(string $code): bool
    {
        if (! preg_match('/^\d{13}$/', $code)) {
            return false;
        }
        $sum = 0;
        for ($i = 0; $i < 12; $i++) {
            $sum += (int) $code[$i] * ($i % 2 === 0 ? 1 : 3);
        }

        return (10 - $sum % 10) % 10 === (int) $code[12];
    }
}
