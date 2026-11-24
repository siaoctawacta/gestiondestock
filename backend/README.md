# Backend Laravel — MM Cosmétiques Stock Pro

API REST (Laravel 12, PHP 8.2+, MySQL/MariaDB) utilisée par le frontend en production quand `VITE_API_URL` est renseignée.
Pour la mise en ligne sur l'hébergement cPanel LWS, suivre le [guide de déploiement](../README.md#déploiement-sur-lws-cpanel--laravel--mysql).

## Développement local

```bash
cd backend
composer install
cp .env.example .env          # puis : APP_ENV=local, APP_DEBUG=true, APP_URL=http://127.0.0.1:8000,
                              #        FRONTEND_URL=http://localhost:5173, DB_*, MAIL_MAILER=log
php artisan key:generate
php artisan migrate --seed    # rôles, 2 boutiques, 7 catégories
php artisan db:seed --class=DemoCatalogSeeder   # facultatif : 30 produits + stock de formation
php artisan mm:create-admin vous@mmconsultingtg.com --first=Prénom --last=Nom
php artisan serve             # http://127.0.0.1:8000/api/health
```

Côté frontend : `VITE_API_URL=http://127.0.0.1:8000` dans `frontend/.env`, puis `npm run dev`.

## Tests

```bash
php artisan test              # SQLite en mémoire (phpunit.xml)
DB_CONNECTION=mysql DB_DATABASE=mmstock_test php artisan test   # contre MySQL/MariaDB, comme la CI
```

Les 21 tests couvrent la connexion, l'isolement par boutique, les droits par rôle, les ventes (totaux recalculés, remise superviseur, survente refusée), les entrées et ajustements, les transferts, les déclarations, la suppression logique et l'immuabilité des journaux.

## Organisation

```
app/
  Http/Controllers/Api/   Auth, User, Store, Catalog, Stock, Transfer, Sale, DailyReport, Notification, Audit
  Services/               StockService, SaleService, TransferService, DailyReportService (transactions + verrous)
  Support/                Permissions (matrice des rôles), Audit, Notify, Counter (numéros TK-/TRF-), Present (JSON)
  Models/                 modèles Eloquent (UUID)
  Console/Commands/       mm:create-admin
database/
  migrations/             schéma complet
  seeders/                RoleSeeder, ReferenceSeeder (data/reference.json), DemoCatalogSeeder
routes/api.php            toutes les routes, préfixe /api
```

`database/seeders/data/reference.json` est généré depuis le frontend (`npm run seed:sql` à la racine) : les boutiques et catégories restent identiques entre le mode démo et la production.

## Sécurité

- Authentification par jeton Sanctum (en-tête `Authorization: Bearer`), expiration après `TOKEN_DAYS` jours, tentatives de connexion limitées (10 par minute).
- Chaque requête vérifie le rôle (`App\Support\Permissions`, même matrice que `frontend/src/lib/permissions.ts`) et le périmètre de boutiques : un caissier ou un responsable ne voit et n'écrit que sur sa boutique.
- Totaux de vente recalculés sur le serveur depuis le catalogue ; remise > 15 % refusée sans validation d'un responsable.
- Mouvements de stock sous transaction avec verrou de ligne (`lockForUpdate`) : pas de stock négatif, transferts atomiques.
- `stock_movements` et `audit_logs` ne peuvent être ni modifiés ni supprimés.
- Seul le Super Admin crée, modifie ou supprime boutiques et comptes ; suppression logique (`deleted_at`).
- CORS limité aux adresses de `FRONTEND_URL`.

## Principales routes

| Domaine | Routes |
|---|---|
| Connexion | `POST /api/auth/login`, `logout`, `forgot-password`, `reset-password`, `verify-supervisor` ; `GET /api/auth/me` ; `PUT /api/auth/password`, `profile` |
| Administration | `/api/stores`, `/api/users` (+ `PATCH /users/{id}/active`), `/api/audit-logs` |
| Catalogue | `/api/categories`, `/api/suppliers`, `/api/products`, `POST /api/products/image` |
| Stock | `GET /api/inventory`, `PATCH /api/inventory/min-level`, `GET /api/movements`, `POST /api/stock/entries`, `POST /api/stock/adjustments` |
| Transferts | `GET/POST /api/transfers`, `POST /api/transfers/{id}/receive`, `cancel` |
| Ventes | `GET/POST /api/sales` |
| Déclarations | `GET/POST /api/daily-reports`, `GET /api/daily-reports/theoretical`, `POST /api/daily-reports/{id}/submit`, `validate`, `reject` |
| Alertes | `GET /api/notifications`, `POST /api/notifications/{id}/read`, `read-all` |
| Supervision | `GET /api/health` |
