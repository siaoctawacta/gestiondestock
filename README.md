# MM Cosmétiques — Stock Pro

ERP SaaS de gestion de stock, caisse POS multi-boutiques et business intelligence pour les boutiques MM Cosmétiques.

**Stack** : React 18 · TypeScript strict · Tailwind CSS · composants Shadcn UI (Radix) · Zustand · TanStack Query · API **Laravel 12** (PHP 8.2+) · **MySQL / MariaDB**.

## Organisation du dépôt

| Dossier | Contenu | Détails |
|---|---|---|
| [`frontend/`](frontend/) | Application React (interface, mode démo, exports) | [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | **API Laravel + MySQL** : backend de production (hébergement cPanel LWS) | [backend/README.md](backend/README.md) |
| [`backend-supabase/`](backend-supabase/) | Variante Supabase du backend (PostgreSQL, RLS), conservée comme alternative | [backend-supabase/README.md](backend-supabase/README.md) |
| [`scripts/build-lws.sh`](scripts/build-lws.sh) | Fabrique les archives à téléverser sur LWS | voir le guide ci-dessous |

Mise en ligne : [Déploiement sur LWS (cPanel + Laravel + MySQL)](#déploiement-sur-lws-cpanel--laravel--mysql).

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

## Déploiement sur LWS (cPanel + Laravel + MySQL)

Tout s'installe sur l'hébergement web **cPanel** de LWS, sans serveur dédié :

| Élément | Où | Adresse (exemple) |
|---|---|---|
| API Laravel (`backend/`) | dossier `~/mm-api`, hors de `public_html` | `https://api.mmcosmetiques.com` |
| Base de données | MySQL / MariaDB de cPanel | `localhost` |
| Application React (`frontend/`) | dossier `~/stock` | `https://stock.mmcosmetiques.com` |
| Emails « mot de passe oublié » | boîte email cPanel | `contact@mmcosmetiques.com` |

Remplacez `mmcosmetiques.com` par votre domaine et `cpaneluser` par votre identifiant cPanel partout dans ce guide.

> **Le Laravel installé avec l'installateur automatique de LWS** confirme que PHP fonctionne, mais ce n'est qu'un projet vide : il est remplacé par le backend de ce dépôt. S'il a créé une base de données, vous pouvez la réutiliser (ses identifiants sont dans son fichier `.env`) ; sinon supprimez cette installation depuis l'installateur pour éviter la confusion.

### 1. Préparer les archives

Deux fichiers ZIP sont à téléverser : `mm-api.zip` (l'API, dépendances `vendor/` incluses, donc **pas besoin de Composer sur le serveur**) et `mm-frontend.zip` (l'application compilée pour l'adresse de votre API).

- **Depuis GitHub, sans rien installer** : onglet **Actions** → **Archives LWS** → **Run workflow**, saisissez l'adresse de l'API (`https://api.mmcosmetiques.com`), lancez. À la fin, téléchargez `mm-api` et `mm-frontend` en bas de la page de l'exécution (GitHub les livre chacun dans un ZIP : décompressez-le une fois pour obtenir `mm-api.zip` et `mm-frontend.zip`).
- **Depuis un ordinateur** avec PHP 8.2, Composer, Node 20+ et `zip` :
  ```bash
  scripts/build-lws.sh https://api.mmcosmetiques.com
  ```
  Les archives sont créées dans `deploy/`.

### 2. Régler PHP

cPanel → **Sélectionner une version de PHP** (*Select PHP Version*) :

1. Version **8.2 ou plus récente** (8.3 conseillé).
2. Extensions cochées : `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `fileinfo`, `bcmath`, `intl`, `zip` (la plupart le sont déjà).
3. Onglet **Options** : `upload_max_filesize` et `post_max_size` à **8M** au moins (images produits jusqu'à 2 Mo), `memory_limit` à **256M**.

### 3. Créer la base de données

cPanel → **Bases de données MySQL** :

1. **Créer une base** : `mmstock` → cPanel la nomme `cpaneluser_mmstock`.
2. **Ajouter un utilisateur** : `mmstock` avec un mot de passe fort (générateur cPanel) → `cpaneluser_mmstock`. **Notez le mot de passe.**
3. **Ajouter l'utilisateur à la base** → cochez **TOUS LES PRIVILÈGES**.

Les tables sont créées à l'étape 7 par Laravel : n'importez rien dans phpMyAdmin.

### 4. Créer les sous-domaines

cPanel → **Domaines** (ou **Sous-domaines**) :

| Sous-domaine | Racine du document (*Document Root*) |
|---|---|
| `api.mmcosmetiques.com` | `mm-api/public` |
| `stock.mmcosmetiques.com` | `stock` |

La racine de l'API doit être le dossier **`public`** de Laravel : le reste (`.env`, code, `vendor/`) reste ainsi inaccessible depuis le web.

> Si cPanel refuse une racine hors de `public_html`, créez le sous-domaine avec la racine `public_html/api`, puis remplacez ce dossier par un lien vers `mm-api/public` depuis le terminal SSH (étape 6) :
> ```bash
> rm -rf ~/public_html/api && ln -s ~/mm-api/public ~/public_html/api
> ```

Puis cPanel → **SSL/TLS Status** (ou **Let's Encrypt**) : générez un certificat pour les deux sous-domaines. Comptez quelques minutes après la création des sous-domaines (propagation DNS).

### 5. Téléverser les fichiers

cPanel → **Gestionnaire de fichiers** :

1. Dans votre dossier personnel (au-dessus de `public_html`), **Téléverser** `mm-api.zip`, puis clic droit → **Extract** : vous obtenez `~/mm-api/` (avec `app/`, `public/`, `vendor/`…). Supprimez le ZIP.
2. Ouvrez `~/stock/` (créé avec le sous-domaine), supprimez son contenu par défaut, téléversez `mm-frontend.zip` et extrayez-le **dans** ce dossier : `index.html`, `assets/` et `.htaccess` doivent être directement dans `~/stock/`. Supprimez le ZIP.

Le fichier `.htaccess` est caché par défaut : *Paramètres* (en haut à droite) → **Afficher les fichiers cachés**.

### 6. Configurer l'API (`.env`)

Dans `~/mm-api/`, copiez `.env.example` en `.env` (clic droit → *Copy*), puis **Edit** :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.mmcosmetiques.com
FRONTEND_URL=https://stock.mmcosmetiques.com

DB_DATABASE=cpaneluser_mmstock
DB_USERNAME=cpaneluser_mmstock
DB_PASSWORD=le-mot-de-passe-de-l-etape-3

MAIL_HOST=mail.mmcosmetiques.com
MAIL_USERNAME=contact@mmcosmetiques.com
MAIL_PASSWORD=le-mot-de-passe-de-la-boite-email
MAIL_FROM_ADDRESS=contact@mmcosmetiques.com
```

- `FRONTEND_URL` sert aux liens « mot de passe oublié » et autorise l'application à appeler l'API (CORS). Une adresse fausse = « Failed to fetch » dans l'application.
- La boîte email se crée dans cPanel → **Comptes de messagerie** ; les paramètres SMTP exacts sont dans *Connect Devices* (port 465, SSL).
- `APP_DEBUG` doit rester à `false` : sinon une erreur afficherait vos mots de passe à l'écran.

### 7. Installer la base et le premier compte

Ouvrez un terminal : dans l'espace client LWS, **Gestion du service** de votre hébergement → **Terminal SSH** (ou cPanel → **Terminal**). Puis :

```bash
cd ~/mm-api
php -v                               # doit afficher 8.2 ou plus
php artisan key:generate --force     # clé de chiffrement (une seule fois)
php artisan migrate --force          # crée toutes les tables
php artisan db:seed --force          # rôles + boutiques Agbalépédo et Cacaveli + catégories
php artisan mm:create-admin direction@mmcosmetiques.com --first=Prénom --last=Nom
php artisan optimize                 # met la configuration en cache (à relancer après chaque modification du .env)
chmod -R 775 storage bootstrap/cache public/uploads
```

`mm:create-admin` demande le mot de passe du premier **Super Admin** (8 caractères minimum). Les autres comptes se créent ensuite depuis l'écran **Utilisateurs** de l'application.

> Si `php -v` affiche une version trop ancienne alors que cPanel indique 8.2+, utilisez le binaire complet, par exemple `/opt/alt/php83/usr/bin/php artisan …` (ou `ea-php83`, selon le serveur).

Catalogue de formation (facultatif, à **ne pas** lancer sur une base réelle déjà remplie) : `php artisan db:seed --class=DemoCatalogSeeder --force` ajoute 30 produits et 50 unités de stock par boutique.

### 8. Vérifier

1. `https://api.mmcosmetiques.com/api/health` → `{"status":"ok",…}`.
2. `https://stock.mmcosmetiques.com` → écran de connexion **sans** bandeau « Mode démo ». Connectez-vous avec le Super Admin.
3. **Boutiques** : vérifiez adresses et téléphones ; **Catalogue** : créez un produit avec image ; **Utilisateurs** : créez les comptes du personnel.
4. **Mot de passe oublié** depuis l'écran de connexion : l'email doit arriver avec un lien vers `stock.mmcosmetiques.com/reset-password`.

| Symptôme | Cause probable |
|---|---|
| Erreur 500 sur l'API | `.env` incomplet ou clé manquante : lire `~/mm-api/storage/logs/laravel-<date>.log` |
| « Failed to fetch » à la connexion | `FRONTEND_URL` ne correspond pas exactement à l'adresse de l'application, ou certificat SSL absent sur l'API |
| Bandeau « Mode démo » | `mm-frontend.zip` construit sans adresse d'API : relancer l'étape 1 avec la bonne adresse |
| Page blanche ou 404 sur `/pos` après actualisation | `.htaccess` absent de `~/stock/` |
| `SQLSTATE[HY000] [1045]` | identifiants MySQL faux, ou utilisateur non ajouté à la base (étape 3) |
| Images produits non affichées | droits d'écriture sur `public/uploads` (`chmod -R 775`) |
| Emails non reçus | identifiants SMTP, ou dossier spam ; tester la boîte dans *Webmail* |
| Modification du `.env` sans effet | relancer `php artisan optimize` |

### Mises à jour, sauvegardes, maintenance

| Opération | Comment |
|---|---|
| Mettre à jour l'application | Refaire l'étape 1 ; renommer `~/mm-api` en `~/mm-api-ancien`, extraire le nouveau `mm-api.zip`, y recopier l'ancien `.env` et le dossier `public/uploads`, puis `php artisan migrate --force && php artisan optimize`. Pour le frontend, remplacer le contenu de `~/stock/`. Supprimer `~/mm-api-ancien` une fois vérifié. |
| Sauvegarde de la base | cPanel → **Sauvegarde** → *Télécharger une sauvegarde de base de données MySQL* (ou phpMyAdmin → Exporter). Au moins une fois par semaine, à conserver **hors** de l'hébergement. |
| Sauvegarde automatique | cPanel → **Tâches Cron**, chaque nuit : `mysqldump --no-tablespaces -u cpaneluser_mmstock -p'MOTDEPASSE' cpaneluser_mmstock \| gzip > ~/sauvegardes/mm-$(date +\%F).sql.gz` (créer `~/sauvegardes` avant). |
| Sauvegarde des images | dossier `~/mm-api/public/uploads` (Gestionnaire de fichiers → *Compress*). |
| Restaurer | phpMyAdmin → base `cpaneluser_mmstock` → **Importer** le fichier `.sql`. |
| Journaux d'erreurs | `~/mm-api/storage/logs/` (un fichier par jour, 14 jours conservés). |
| Mettre l'API en maintenance | `php artisan down` puis `php artisan up`. |
| Compte Super Admin perdu | `php artisan mm:create-admin email@… --first=… --last=…` (crée ou réinitialise le compte). |

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
