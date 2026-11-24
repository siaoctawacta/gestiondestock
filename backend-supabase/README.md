# Backend alternatif — Supabase

> Le backend de production recommandé est l'API **Laravel + MySQL** du dossier [`../backend`](../backend), déployée sur l'hébergement cPanel LWS. Ce dossier reste disponible pour héberger l'application sur Supabase (PostgreSQL, Auth, RLS) à la place.

Version Supabase du backend : il n'y a pas de serveur Node.js à maintenir.

```
supabase/
  migrations/   schéma PostgreSQL, fonctions RPC, triggers, polices RLS (appliquées dans l'ordre)
  functions/    Edge Functions Deno : admin-users (comptes, Super Admin), verify-supervisor (remises > 15 %)
  tests/        tests pgTAP de sécurité RLS
  seed.sql      référentiels de départ (généré, voir plus bas)
  config.toml   configuration locale du CLI Supabase
```

Les commandes du CLI Supabase se lancent **depuis ce dossier** (`backend-supabase/`) :

```bash
cd backend-supabase
supabase start            # base locale + migrations + seed
supabase test db          # tests RLS
supabase link --project-ref <ref>
supabase db push --remote # applique les migrations sur le projet distant
                          # (CLI ≥ 3 : sans --remote, la commande vise la base locale)
supabase functions deploy admin-users
supabase functions deploy verify-supervisor
```

`seed.sql` est généré à partir des données démo du frontend pour que les deux restent alignés :

```bash
cd frontend && npm run seed:sql
```

## Mise en production avec Supabase (alternative à Laravel)

1. Créer un projet Supabase, puis appliquer le schéma :
   ```bash
   cd backend-supabase
   supabase link --project-ref <ref>
   supabase db push --remote  # applique backend-supabase/supabase/migrations/* au projet en ligne
   psql "$DATABASE_URL" -f supabase/seed.sql   # catégories, fournisseurs, boutiques, produits
   ```
2. Déployer les Edge Functions (création de comptes et validation superviseur, qui exigent la clé `service_role` côté serveur) :
   ```bash
   cd backend-supabase
   supabase functions deploy admin-users
   supabase functions deploy verify-supervisor
   ```
3. Créer le premier Super Admin : *Authentication → Add user*, puis
   ```sql
   update public.users set role_id = 'super_admin', first_name = 'Prénom', last_name = 'Nom' where email = 'vous@mmcosmetiques.com';
   ```
   Les autres comptes se créent ensuite depuis l'écran **Utilisateurs**.
4. Copier `frontend/.env.example` en `frontend/.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
5. Dans *Authentication → URL Configuration*, ajouter `https://<votre-domaine>/reset-password` aux URL de redirection.

### Déploiement Vercel

Importer le dépôt dans Vercel avec **Root Directory = `frontend`** (preset Vite), puis définir les deux variables d'environnement. `frontend/vercel.json` gère la réécriture SPA et les en-têtes de sécurité. Chaque branche obtient une URL de prévisualisation.

## Supabase et serveur LWS

L'application a deux parties qui s'hébergent différemment :

- **Le frontend** n'est qu'un ensemble de fichiers statiques (`frontend/dist/`) : n'importe quel hébergement web LWS peut le servir.
- **Le backend** est un projet **Supabase**, pas une simple base de données : PostgreSQL, mais aussi l'authentification, l'API REST, le temps réel, le stockage des images et les Edge Functions. Une base PostgreSQL seule, comme celle fournie avec l'hébergement mutualisé cPanel, ne suffit donc pas.

Deux options :

| | Option A — recommandée | Option B — tout chez LWS |
|---|---|---|
| Frontend | Hébergement web LWS (cPanel) | VPS LWS |
| Backend | Supabase Cloud (supabase.com) | Supabase auto-hébergé sur le même VPS LWS (Docker) |
| Mise en place | ~30 min, aucune administration serveur | ~2 h, administration Linux requise |
| Sauvegardes, mises à jour, sécurité de la base | Gérées par Supabase | **À votre charge** |

### Option A — Frontend sur l'hébergement LWS, base sur Supabase Cloud

**1. Créer la base de données (une seule fois)**

1. Créez un compte et un projet sur [supabase.com](https://supabase.com). Choisissez une région proche (ex. *West EU*) et notez le **mot de passe de la base**.
2. Dans *Project Settings → API*, notez l'**URL du projet** et la clé **anon public**.
3. Sur votre ordinateur, avec le [CLI Supabase](https://supabase.com/docs/guides/cli) installé :
   ```bash
   cd backend-supabase
   supabase login
   supabase link --project-ref <ref-du-projet>     # le <ref> est dans l'URL du projet
   supabase db push --remote                       # crée tables, fonctions et règles de sécurité
   psql "<chaîne de connexion>" -f supabase/seed.sql   # boutiques, catégories, fournisseurs, produits
   supabase functions deploy admin-users
   supabase functions deploy verify-supervisor
   ```
   La chaîne de connexion est dans *Project Settings → Database → Connection string*. Ne lancez `seed.sql` qu'**une seule fois**, sur une base vide.

   > **Important :** depuis la version 3 du CLI, `supabase db push` et `supabase db dump` visent la base **locale** par défaut. Ajoutez toujours `--remote` pour agir sur le projet en ligne (`supabase functions deploy` vise déjà le projet lié).
4. Créez le premier Super Admin : *Authentication → Users → Add user* (email + mot de passe, cochez *Auto Confirm User*), puis dans *SQL Editor* :
   ```sql
   update public.users
      set role_id = 'super_admin', first_name = 'Prénom', last_name = 'Nom'
    where email = 'vous@mmcosmetiques.com';
   ```
   Les autres comptes se créent ensuite depuis l'écran **Utilisateurs** de l'application.
5. Dans *Authentication → URL Configuration*, mettez **Site URL** = `https://mmcosmetiques.com` et ajoutez `https://mmcosmetiques.com/reset-password` aux *Redirect URLs* (lien « mot de passe oublié »).

**2. Construire le site**

Les clés Supabase sont intégrées au moment du build : construisez sur votre ordinateur, pas sur le serveur.

```bash
cd frontend
cp .env.example .env      # puis renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm ci
npm run build             # produit frontend/dist/
```

La clé *anon* peut être publique : la sécurité repose sur les règles RLS de la base. Ne mettez **jamais** la clé *service_role* dans `.env`.

**3. Mettre en ligne sur l'hébergement LWS**

1. Dans l'espace client LWS, ouvrez le **cPanel** de votre hébergement et activez le **certificat SSL** (Let's Encrypt) du domaine.
2. Ouvrez le **Gestionnaire de fichiers** et allez dans `public_html/` (ou le dossier racine du domaine / sous-domaine choisi). Videz-le s'il contient la page par défaut.
3. Déposez **le contenu** de `frontend/dist/` : `index.html`, le dossier `assets/`, les logos **et le fichier caché `.htaccess`** (activez *Afficher les fichiers cachés* dans les paramètres du gestionnaire). Le plus simple : compressez le contenu de `dist/` en `.zip`, envoyez-le, puis *Extraire*.
   - Avec un client FTP (FileZilla, identifiants FTP de l'espace client) : copiez le contenu de `dist/` dans `public_html/`.
4. Ouvrez `https://mmcosmetiques.com` et connectez-vous avec le Super Admin.

Le `.htaccess` (dans `frontend/public/`, copié à chaque build) force le HTTPS et renvoie les URL de l'application (`/pos`, `/stores`…) vers `index.html`. **Sans lui, recharger une page autre que l'accueil donne une erreur 404.**

**4. Opérations courantes (option A)**

| Opération | Commande / action |
|---|---|
| Publier une nouvelle version | `cd frontend && npm run build`, puis remplacer le contenu de `public_html/` par celui de `dist/` (gardez le `.htaccess`) |
| Appliquer une nouvelle migration | `cd backend-supabase && supabase db push --remote` (à faire **avant** de publier le frontend qui en dépend ; `--dry-run` pour prévisualiser) |
| Mettre à jour une Edge Function | `cd backend-supabase && supabase functions deploy <nom>` |
| Sauvegarder la base | Automatique côté Supabase (*Database → Backups*, selon l'offre). Copie manuelle (Docker requis sur votre poste), voir ci-dessous |
| Restaurer une sauvegarde manuelle | Voir ci-dessous |
| Voir les erreurs | Supabase : *Logs* (API, Auth, Postgres, Edge Functions). Navigateur : console (F12) |

Sauvegarde manuelle avec le CLI (rôles, structure et données dans trois fichiers) :

```bash
cd backend-supabase
supabase db dump --remote --role-only -f roles.sql
supabase db dump --remote -f schema.sql
supabase db dump --remote --data-only --use-copy -f data.sql
```

Restauration dans un projet vide (chaîne de connexion du projet cible) :

```bash
psql "<chaîne de connexion>" --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql
```

### Option B — Tout sur un VPS LWS (Supabase auto-hébergé)

À réserver si les données doivent rester sur vos serveurs. Supabase auto-hébergé est maintenu par la communauté : sauvegardes, mises à jour et sécurité sont à votre charge.

**Prérequis :** un **VPS LWS** sous Ubuntu, de préférence le modèle **Docker** (Docker préinstallé, accès root SSH envoyé par email), 4 Go de RAM minimum ; un domaine avec deux enregistrements DNS de type A vers l'IP du VPS, par exemple `stock.mmcosmetiques.com` (application) et `api.mmcosmetiques.com` (Supabase).

**1. Installer Supabase sur le VPS**

```bash
ssh root@<ip-du-vps>
apt update && apt upgrade -y
apt install -y git postgresql-client
# si le VPS n'a pas Docker : curl -fsSL https://get.docker.com | sh

git clone --depth 1 https://github.com/supabase/supabase /opt/supabase-src
mkdir -p /opt/supabase && cp -r /opt/supabase-src/docker/. /opt/supabase/
cd /opt/supabase
cp .env.example .env
sh utils/generate-keys.sh --update-env    # génère JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, etc.
nano .env
```

Dans `.env`, **avant le premier démarrage**, vérifiez ou modifiez au minimum :

| Variable | Valeur |
|---|---|
| `POSTGRES_PASSWORD` | long mot de passe aléatoire (notez-le) |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | identifiants du tableau de bord Studio |
| `SUPABASE_PUBLIC_URL` | `https://api.mmcosmetiques.com` |
| `API_EXTERNAL_URL` | `https://api.mmcosmetiques.com/auth/v1` |
| `SITE_URL` | `https://stock.mmcosmetiques.com` |
| `ADDITIONAL_REDIRECT_URLS` | `https://stock.mmcosmetiques.com/reset-password` |
| `DISABLE_SIGNUP` | `true` (les comptes sont créés par le Super Admin, pas en libre inscription) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | paramètres d'une boîte email (ex. votre messagerie LWS) pour l'email « mot de passe oublié » |

Le fichier `.env.example` liste tous les secrets à changer en tête de fichier ; ne laissez **aucune** valeur par défaut. Puis :

```bash
sh run.sh start       # docker compose up -d --wait
sh run.sh status      # tous les services doivent être "healthy"
```

**2. Fermer les ports internes (important)**

Par défaut, Docker publie sur Internet le port de l'API (`8000`) et ceux de PostgreSQL (`5432`, `6543`). Seuls 22 (SSH), 80 et 443 doivent être ouverts. Attention : **les règles `ufw` ne s'appliquent pas aux ports publiés par Docker** ; il faut passer par la chaîne `DOCKER-USER` :

```bash
ip route | grep default                     # repérez l'interface publique, ex. eth0 ou ens3
iptables -I DOCKER-USER -i eth0 -p tcp -m multiport --dports 8000,5432,6543 -j DROP
apt install -y iptables-persistent && netfilter-persistent save
```

Le proxy HTTPS ci-dessous accède à l'API en local (`localhost:8000`), il n'est donc pas bloqué.

**3. HTTPS et site web avec Caddy**

Caddy obtient et renouvelle automatiquement les certificats Let's Encrypt :

```bash
apt install -y caddy
mkdir -p /var/www/mm-stock
cat > /etc/caddy/Caddyfile <<'CADDY'
api.mmcosmetiques.com {
    reverse_proxy localhost:8000
}

stock.mmcosmetiques.com {
    root * /var/www/mm-stock
    encode gzip
    try_files {path} /index.html
    file_server
}
CADDY
systemctl reload caddy
```

Le tableau de bord Studio est alors sur `https://api.mmcosmetiques.com` (identifiants `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`).

**4. Installer la base de l'application**

Dans le conteneur, les connexions via `localhost` sont acceptées sans mot de passe : c'est pourquoi toutes les commandes ci-dessous passent `-h localhost`. Les migrations s'exécutent avec le rôle `postgres` (comme sur Supabase Cloud) ; les sauvegardes complètes avec le superutilisateur `supabase_admin`.

Depuis le VPS, avec une copie du dépôt :

```bash
git clone https://github.com/siaoctawacta/gestiondestock /opt/gestiondestock
cd /opt/gestiondestock/backend-supabase/supabase

# Migrations, dans l'ordre (les noms de fichiers sont horodatés)
for f in migrations/*.sql; do
  echo "== $f"
  docker exec -i supabase-db psql -h localhost -v ON_ERROR_STOP=1 -U postgres -d postgres < "$f" || break
done

# Données de départ : UNE SEULE FOIS, sur une base vide
docker exec -i supabase-db psql -h localhost -v ON_ERROR_STOP=1 -U postgres -d postgres < seed.sql

# Edge Functions : à côté du dossier "main" fourni par Supabase
cp -r functions/admin-users functions/verify-supervisor /opt/supabase/volumes/functions/
cd /opt/supabase && sh run.sh restart functions
```

Créez ensuite le premier Super Admin dans Studio (*Authentication → Add user*), puis :

```bash
docker exec -i supabase-db psql -h localhost -U postgres -d postgres -c \
  "update public.users set role_id = 'super_admin', first_name = 'Prénom', last_name = 'Nom' where email = 'vous@mmcosmetiques.com';"
```

**5. Construire et publier le frontend**

Sur votre ordinateur, `frontend/.env` contient `VITE_SUPABASE_URL=https://api.mmcosmetiques.com` et `VITE_SUPABASE_ANON_KEY=<ANON_KEY du .env du VPS>`, puis :

```bash
cd frontend && npm ci && npm run build
rsync -av --delete dist/ root@<ip-du-vps>:/var/www/mm-stock/
```

**6. Opérations courantes (option B)**

| Opération | Commande (sur le VPS) |
|---|---|
| État des services | `cd /opt/supabase && sh run.sh status` |
| Journaux | `sh run.sh logs` ou `sh run.sh logs auth` (aussi : `rest`, `db`, `functions`, `storage`) |
| Redémarrer | `sh run.sh restart` (ou un seul service : `sh run.sh restart functions`) |
| Nouvelle version du frontend | sur votre poste : `npm run build` puis le `rsync` ci-dessus |
| Nouvelle migration | `cd /opt/gestiondestock && git pull`, puis `docker exec -i supabase-db psql -h localhost -v ON_ERROR_STOP=1 -U postgres -d postgres < backend-supabase/supabase/migrations/<nouveau-fichier>.sql` |
| Mettre à jour une Edge Function | recopier son dossier dans `/opt/supabase/volumes/functions/` puis `sh run.sh restart functions` |
| Sauvegarde manuelle | `docker exec supabase-db pg_dump -h localhost -U supabase_admin -d postgres -Fc > /root/backups/mm-$(date +%F).dump` |
| Restaurer | `docker exec -i supabase-db pg_restore -h localhost --clean --if-exists -U supabase_admin -d postgres < /root/backups/mm-AAAA-MM-JJ.dump` |
| Mettre à jour Supabase | **après une sauvegarde** : `sh update.sh --dry-run`, `sh update.sh`, puis `sh run.sh pull && sh run.sh recreate` |

Sauvegarde automatique chaque nuit à 2 h, avec 14 jours d'historique (`crontab -e`) :

```bash
mkdir -p /root/backups
0 2 * * * docker exec supabase-db pg_dump -h localhost -U supabase_admin -d postgres -Fc > /root/backups/mm-$(date +\%F).dump && find /root/backups -name 'mm-*.dump' -mtime +14 -delete
```

Copiez régulièrement `/root/backups` **hors du VPS** (votre ordinateur, un stockage externe) : une sauvegarde restée sur le serveur disparaît avec lui.

Pour aller plus loin : documentation officielle [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker) et [mise à jour](https://supabase.com/docs/guides/self-hosting/updating).
