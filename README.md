# MM Cosmétiques — Stock Pro

ERP SaaS de gestion de stock, caisse POS multi-boutiques et business intelligence pour les boutiques MM Cosmétiques.

**Stack** : React 18 · TypeScript strict · Tailwind CSS · composants Shadcn UI (Radix) · Zustand · TanStack Query · API **Laravel 12** (PHP 8.2+) · **MySQL / MariaDB**.

## Organisation du dépôt

| Dossier | Contenu | Détails |
|---|---|---|
| [`frontend/`](frontend/) | Application React (interface, mode démo, exports) | [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | **API Laravel + MySQL** : backend de production (hébergement LWS) | [backend/README.md](backend/README.md) |
| [`backend-supabase/`](backend-supabase/) | Variante Supabase du backend (PostgreSQL, RLS), conservée comme alternative | [backend-supabase/README.md](backend-supabase/README.md) |
| [`scripts/build-lws.sh`](scripts/build-lws.sh) | Fabrique `mm-stockpro.zip`, l'archive à téléverser sur LWS | voir le guide ci-dessous |

Mise en ligne : [Déploiement sur LWS (Laravel + MySQL)](#déploiement-sur-lws-laravel--mysql).

Documentation PDF à partager : [documentation technique d'hébergement sur LWS](docs/MM-Cosmetiques-Stock-Pro_Documentation-technique-LWS.pdf) et [guide d'utilisation pour la formation](docs/MM-Cosmetiques-Stock-Pro_Guide-utilisateur.pdf) (sources dans [`docs/`](docs/)).

Le frontend choisit son backend au moment du build : `VITE_API_URL` → API Laravel (`frontend/src/data/laravelApi.ts`) ; sinon `VITE_SUPABASE_URL` → Supabase ; sinon mode démo dans le navigateur.

## Démarrage rapide (mode démo)

```bash
cd frontend
npm install
npm run dev
```

(Depuis la racine, `npm run setup` puis `npm run dev` font la même chose.)

Sans variable de backend, l'application démarre en **mode démo** : les données (les 2 boutiques Agbalépédo et Cacaveli, 30 produits, 60 jours de ventes) sont générées localement dans le navigateur et les règles RLS sont émulées côté client. L'écran de connexion propose un accès rapide pour chacun des 6 rôles (mot de passe commun `demo1234`).

| Rôle | Email démo |
|---|---|
| Super Admin | admin@mmcg.tg |
| Admin Boutique | admin.boutique@mmcg.tg |
| Responsable Boutique | resp.agbalepedo@mmcg.tg |
| Chef de Pôle | pole@mmcg.tg |
| Caissier | caisse.agbalepedo@mmcg.tg |
| Gestionnaire Stock | stock@mmcg.tg |

Les données démo se réinitialisent depuis **Paramètres → Données de démonstration**.

## Déploiement sur LWS (Laravel + MySQL)

L'application s'installe sur l'hébergement mutualisé LWS (**LWS Panel**), dans le dossier du sous-domaine `stockpro.mmconsultingtg.com` :

| Adresse | Ce qui répond |
|---|---|
| `https://stockpro.mmconsultingtg.com` | l'application (écran de connexion, caisse, stocks…) |
| `https://stockpro.mmconsultingtg.com/api/…` | l'API Laravel, qui lit et écrit dans la base MySQL |

### Structure sur le serveur

Sur LWS, chaque domaine et sous-domaine a son dossier dans `htdocs/`, qui en est la racine web. L'application occupe tout le dossier du sous-domaine :

```
/home/                                   (« ~ » dans le terminal SSH)
└── htdocs/
    ├── index.php, wp-admin/, …          site WordPress de mmconsultingtg.com : ne pas toucher
    ├── mmcosmetiques.com/, …            autres sites : ne pas toucher
    └── stockpro.mmconsultingtg.com/     ← contenu de mm-stockpro.zip
        ├── .htaccess                    renvoie toutes les requêtes vers public/
        ├── .env                         configuration et mots de passe (créé à l'étape 5)
        ├── app/ bootstrap/ config/ database/ resources/ routes/ storage/ vendor/
        └── public/                      seul dossier servi sur le web
            ├── index.html, assets/      application React
            ├── index.php                entrée de l'API Laravel (/api/…)
            ├── .htaccess                /api → Laravel, le reste → application
            └── uploads/products/        images des produits
```

Le `.htaccess` à la racine fait passer chaque adresse par `public/` : `.env`, `vendor/`, `storage/` et le code ne sont **jamais** accessibles depuis Internet (vérifié : `/.env` → 403, `/composer.json` → application).

> **Ne déposez pas le code source GitHub** (`gestiondestock-main`) sur le serveur : il ne fonctionne pas tel quel (rien n'est compilé ni installé) et serait lisible par tout le monde. Seule l'archive `mm-stockpro.zip` est à téléverser.

### 1. Récupérer l'archive

GitHub → onglet **Actions** → **Archive LWS** → **Run workflow** (l'adresse proposée est déjà `https://stockpro.mmconsultingtg.com`). Après 2 à 3 minutes, en bas de la page de l'exécution (*Artifacts*), cliquez sur **mm-stockpro** : vous obtenez `mm-stockpro.zip`, à garder tel quel.

Elle contient l'API avec ses dépendances (`vendor/`, donc **pas de Composer sur le serveur**) et l'application déjà compilée pour `stockpro.mmconsultingtg.com`. Depuis un ordinateur avec PHP 8.2, Composer, Node 20+ et `zip`, `scripts/build-lws.sh https://stockpro.mmconsultingtg.com` produit la même archive dans `deploy/`.

### 2. Régler PHP et la base de données (LWS Panel)

1. **Version PHP** du site : **8.2 ou plus récente** (8.3 conseillé), avec les extensions `pdo_mysql`, `mbstring`, `openssl`, `xml`, `ctype`, `fileinfo`, `bcmath`, `intl`, `zip`. Taille d'envoi maximale (`upload_max_filesize`, `post_max_size`) : 8 Mo au moins.
2. **Version PHP du terminal** : en haut du **Terminal SSH**, lien « *Si vous souhaitez changer la version PHP du terminal par défaut, cliquez ici* » → choisissez la même version. Vérifiez ensuite avec `php -v`.
3. **Base MySQL** : la base créée par l'installateur automatique de Laravel peut être réutilisée. Ses identifiants (`DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) sont dans `htdocs/stockpro.mmconsultingtg.com/.env` : **notez-les avant l'étape 3**. Sinon, créez une base dans la rubrique MySQL de LWS Panel et notez le serveur, le nom, l'utilisateur et le mot de passe indiqués.

### 3. Remplacer le Laravel d'exemple

Le Laravel installé automatiquement par LWS n'est qu'un projet vide : il est remplacé par l'archive. Dans le **Terminal SSH** :

```bash
cd ~/htdocs
mv stockpro.mmconsultingtg.com stockpro-ancien    # mise de côté (à supprimer à la fin)
```

Puis dans le **Gestionnaire de fichiers** :

1. Ouvrez `htdocs`, cliquez sur **Charger** et envoyez `mm-stockpro.zip`.
2. Sélectionnez-le → **Extraire** : un dossier `mm-stockpro` apparaît dans `htdocs`.
3. Renommez `mm-stockpro` en **`stockpro.mmconsultingtg.com`** (ou dans le terminal : `cd ~/htdocs && mv mm-stockpro stockpro.mmconsultingtg.com`).
4. Supprimez `mm-stockpro.zip`.

Vérifiez que `htdocs/stockpro.mmconsultingtg.com/` contient bien `.htaccess`, `.env.example`, `app/`, `public/`, `vendor/`, et que `public/` contient `index.html`, `index.php` et `.htaccess` (affichez les fichiers cachés si besoin).

### 4. Certificat SSL

Dans LWS Panel, rubrique SSL : activez le certificat (Let's Encrypt) pour `stockpro.mmconsultingtg.com`. Le site redirige ensuite automatiquement vers HTTPS.

### 5. Configurer l'application (`.env`)

```bash
cd ~/htdocs/stockpro.mmconsultingtg.com
cp .env.example .env
```

Ouvrez `.env` (Gestionnaire de fichiers → **Modifier**) et renseignez :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://stockpro.mmconsultingtg.com
FRONTEND_URL=https://stockpro.mmconsultingtg.com

DB_HOST=valeur-notée-à-l-étape-2
DB_DATABASE=valeur-notée-à-l-étape-2
DB_USERNAME=valeur-notée-à-l-étape-2
DB_PASSWORD=valeur-notée-à-l-étape-2

MAIL_HOST=mail.mmconsultingtg.com
MAIL_USERNAME=stockpro@mmconsultingtg.com
MAIL_PASSWORD=mot-de-passe-de-la-boîte
MAIL_FROM_ADDRESS=stockpro@mmconsultingtg.com
```

- `APP_URL` et `FRONTEND_URL` : même adresse, sans `/` à la fin.
- La boîte email sert aux liens « mot de passe oublié » : créez-la dans la rubrique Emails de LWS Panel (`stockpro@mmconsultingtg.com` est un exemple) et reprenez son serveur SMTP (port 465, SSL).
- `APP_DEBUG` doit rester à `false` : sinon une erreur afficherait vos mots de passe à l'écran.

### 6. Installer la base et le premier compte

Dans le **Terminal SSH** :

```bash
cd ~/htdocs/stockpro.mmconsultingtg.com
php -v                               # 8.2 ou plus, sinon voir l'étape 2
php artisan key:generate --force     # clé de chiffrement (une seule fois)
php artisan migrate:fresh --force    # PREMIÈRE INSTALLATION SEULEMENT : vide la base et crée toutes les tables
php artisan db:seed --force          # rôles + boutiques Agbalépédo et Cacaveli + catégories
php artisan mm:create-admin votre.email@mmconsultingtg.com --first=Prénom --last=Nom
php artisan optimize                 # à relancer après chaque modification du .env
chmod -R 775 storage bootstrap/cache public/uploads
```

`mm:create-admin` demande le mot de passe du premier **Super Admin** (8 caractères minimum). Les autres comptes se créent ensuite depuis l'écran **Utilisateurs** de l'application.

`migrate:fresh` supprime d'abord les tables d'exemple laissées par l'installateur LWS : certaines portent le même nom que celles de l'application (`users`…), et un simple `migrate` les garderait. Cette commande **efface toute la base** : ne la relancez jamais une fois l'application en service. Pour les mises à jour, c'est `php artisan migrate --force`.

Catalogue de formation (facultatif, à **ne pas** lancer sur une base réelle déjà remplie) : `php artisan db:seed --class=DemoCatalogSeeder --force` ajoute 30 produits et 50 unités de stock par boutique.

### 7. Vérifier, puis nettoyer

1. `https://stockpro.mmconsultingtg.com/api/health` → `{"status":"ok",…}`.
2. `https://stockpro.mmconsultingtg.com/.env` → refusé (403).
3. `https://stockpro.mmconsultingtg.com` → écran de connexion **sans** bandeau « Mode démo » ; connexion avec le Super Admin.
4. **Boutiques** : adresses et téléphones ; **Catalogue** : un produit avec image ; **Utilisateurs** : comptes du personnel.
5. **Mot de passe oublié** depuis l'écran de connexion : l'email arrive avec un lien vers `stockpro.mmconsultingtg.com/reset-password`.
6. Tout fonctionne : supprimez l'ancienne installation.
   ```bash
   cd ~/htdocs && rm -rf stockpro-ancien
   ```

| Symptôme | Cause probable |
|---|---|
| Erreur 500 | `.env` incomplet ou clé manquante : lire `storage/logs/laravel-<date>.log` |
| Page d'accueil Laravel ou liste de fichiers | ancienne installation encore en place, ou `.htaccess` racine absent (fichier caché non extrait) |
| « Failed to fetch » à la connexion | archive construite pour une autre adresse, ou certificat SSL absent |
| Bandeau « Mode démo » | archive construite sans adresse : refaire l'étape 1 |
| `SQLSTATE[HY000] [1045]`, `[1044]` ou `[2002]` | identifiants ou serveur MySQL faux dans `.env` (`DB_HOST` compris) |
| `php artisan` : erreur de syntaxe ou version | PHP du terminal trop ancien : étape 2, point 2 |
| Images produits non affichées | droits d'écriture sur `public/uploads` (`chmod -R 775`) |
| Emails non reçus | identifiants SMTP ou dossier spam ; tester la boîte dans le Webmail |
| Modification du `.env` sans effet | relancer `php artisan optimize` |

### Mises à jour, sauvegardes, maintenance

| Opération | Comment |
|---|---|
| Mettre à jour l'application | Refaire l'étape 1. Dans `htdocs`, renommer `stockpro.mmconsultingtg.com` en `stockpro-ancien`, extraire le nouveau `mm-stockpro.zip` et renommer `mm-stockpro` en `stockpro.mmconsultingtg.com`. Y recopier depuis `stockpro-ancien` le fichier `.env` et le dossier `public/uploads`, puis `php artisan migrate --force && php artisan optimize && chmod -R 775 storage bootstrap/cache public/uploads`. Supprimer `stockpro-ancien` une fois vérifié. |
| Sauvegarde de la base | phpMyAdmin (rubrique MySQL de LWS Panel) → **Exporter**. Au moins une fois par semaine, à conserver **hors** de l'hébergement. |
| Sauvegarde des images | dossier `public/uploads` (Gestionnaire de fichiers → **Archiver**, puis **Télécharger**). |
| Restaurer | phpMyAdmin → **Importer** le fichier `.sql`. |
| Journaux d'erreurs | `storage/logs/` (un fichier par jour, 14 jours conservés). |
| Mettre l'API en maintenance | `php artisan down` puis `php artisan up`. |
| Compte Super Admin perdu | `php artisan mm:create-admin email@… --first=… --last=…` (crée ou réinitialise le compte). |

> **Autre hébergeur (cPanel, VPS)** : si la racine du sous-domaine peut pointer directement sur le dossier `public/`, faites-le ; le `.htaccess` racine est alors simplement ignoré. Les étapes 5 et 6 sont identiques.

## Architecture

```
frontend/src/
  data/          api.ts (contrat) · laravelApi.ts (prod) · supabaseApi.ts (alternative) · demoApi.ts (démo) · logic.ts · seed.ts
  lib/           permissions (RBAC) · analytics (KPI) · export (PDF/Excel) · receipt (ticket 80 mm)
  store/         Zustand : session, panier POS, préférences UI
  hooks/         TanStack Query + actualisation automatique (20 s)
  components/    ui/ (Shadcn) · layout/ · common/
  pages/         un fichier par module
backend/                       API Laravel (voir backend/README.md)
  app/Http/Controllers/Api/    une classe par domaine
  app/Services/                ventes, stock, transferts, déclarations (transactions + verrous)
  app/Support/Permissions.php  matrice des rôles, identique au frontend
  database/migrations/         schéma MySQL
  tests/Feature/               tests de sécurité et de règles métier
backend-supabase/              variante Supabase (migrations, RLS, Edge Functions, pgTAP)
```

### Sécurité (Zero Trust)

- **Chaque requête est vérifiée par l'API** : jeton Sanctum valide, compte actif, droit du rôle (`app/Support/Permissions.php`) et périmètre de boutiques. Un caissier ou un responsable ne lit et n'écrit que sur sa boutique ; seuls `super_admin` et `stock_manager` ont une vue réseau.
- **Aucune écriture directe sur les données sensibles** (stock, mouvements, ventes, transferts, déclarations) : tout passe par des services qui contrôlent rôle et boutique.
- **Totaux de vente recalculés côté serveur** depuis le catalogue. Le client n'envoie que produits et quantités ; une remise > 15 % exige le mot de passe d'un responsable.
- Mouvements de stock sous transaction avec verrou de ligne (`SELECT … FOR UPDATE`), transferts atomiques, `stock_movements` et `audit_logs` inaltérables.
- Journal d'audit sur produits, boutiques, utilisateurs, transferts, remises et déclarations.
- Seul le Super Admin ajoute, modifie ou supprime boutiques et utilisateurs et attribue les rôles.
- Suppression **logique** (`deleted_at`) : l'élément disparaît des listes et un compte supprimé ne peut plus se connecter, mais ventes, mouvements et déclarations restent rattachés. Une boutique ne peut être supprimée qu'une fois ses transferts en transit traités et ses utilisateurs réaffectés.
- Mots de passe hachés (bcrypt), connexions limitées à 10 tentatives par minute, CORS limité à l'adresse de l'application, `.env` hors du dossier public.

### Modules

| # | Module | Écran |
|---|---|---|
| 1 | Authentification, sessions, mot de passe oublié, garde de routes | `/login`, `/forgot-password`, `/reset-password` |
| 2 | Gestion des utilisateurs (création, rôles, désactivation, suppression, dernière connexion) — **Super Admin uniquement** | `/users` |
| 3 | Réseau de boutiques (ajout, modification, suppression) — **Super Admin uniquement** | `/stores` |
| 4 | Catalogue (SKU auto, EAN13, QR code, marge, images) | `/products`, `/catalog-settings` |
| 5 | Stocks, lots & péremption, ajustements, transferts en 2 étapes, journal | `/inventory`, `/transfers`, `/movements` |
| 6 | Caisse POS (scan, remises avec validation superviseur > 15 %, espèces/Mobile Money/carte, ticket PDF) | `/pos`, `/sales` |
| 7 | Déclarations journalières (écart de caisse, Brouillon → Envoyé → Validé/Rejeté) | `/daily-reports` |
| 8 | Alertes (stock faible, rupture, déclaration, écart > 2 %) | cloche + `/notifications` |
| 9 | Tableaux de bord par rôle | `/` |
| 10 | Rapports ventes / stock / marges / employés, export PDF & Excel | `/reports` |
| 11–12 | Schéma de base de données, contrôles d'accès, audit | `backend/database/`, `backend/app/` |

## Qualité

```bash
cd frontend && npm run typecheck && npm test && npm run build   # TypeScript strict, Vitest, build
cd backend && php artisan test                                   # API Laravel : sécurité et règles métier
cd backend-supabase && supabase test db                          # variante Supabase : tests pgTAP
```

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute ces étapes à chaque push et pull request : jobs `frontend`, `backend` (PHP 8.2 + MySQL 8) et `backend-supabase`.
