# MM Cosmétiques — Stock Pro

ERP SaaS de gestion de stock, caisse POS multi-boutiques et business intelligence pour chaînes de cosmétiques.

**Stack** : React 18 · TypeScript strict · Tailwind CSS · composants Shadcn UI (Radix) · Zustand · TanStack Query · Supabase (PostgreSQL, Auth, RLS, Storage, Realtime).

## Démarrage rapide (mode démo)

```bash
npm install
npm run dev
```

Sans variables Supabase, l'application démarre en **mode démo** : les données (5 boutiques, 30 produits, 60 jours de ventes) sont générées localement dans le navigateur et les règles RLS sont émulées côté client. L'écran de connexion propose un accès rapide pour chacun des 6 rôles (mot de passe commun `demo1234`).

| Rôle | Email démo |
|---|---|
| Super Admin | admin@mmcg.ci |
| Admin Boutique | admin.sud@mmcg.ci |
| Responsable Boutique | resp.plateau@mmcg.ci |
| Chef de Pôle | pole.nord@mmcg.ci |
| Caissier | caisse.plateau@mmcg.ci |
| Gestionnaire Stock | stock@mmcg.ci |

Les données démo se réinitialisent depuis **Paramètres → Données de démonstration**.

## Production avec Supabase

1. Créer un projet Supabase, puis appliquer le schéma :
   ```bash
   supabase link --project-ref <ref>
   supabase db push           # applique supabase/migrations/*
   psql "$DATABASE_URL" -f supabase/seed.sql   # catégories, fournisseurs, boutiques, produits
   ```
2. Déployer les Edge Functions (création de comptes et validation superviseur, qui exigent la clé `service_role` côté serveur) :
   ```bash
   supabase functions deploy admin-users
   supabase functions deploy verify-supervisor
   ```
3. Créer le premier Super Admin : *Authentication → Add user*, puis
   ```sql
   update public.users set role_id = 'super_admin', first_name = 'Prénom', last_name = 'Nom' where email = 'vous@domaine.ci';
   ```
   Les autres comptes se créent ensuite depuis l'écran **Utilisateurs**.
4. Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
5. Dans *Authentication → URL Configuration*, ajouter `https://<votre-domaine>/reset-password` aux URL de redirection.

### Déploiement Vercel

Importer le dépôt dans Vercel (preset Vite), définir les deux variables d'environnement. `vercel.json` gère la réécriture SPA et les en-têtes de sécurité. Chaque branche obtient une URL de prévisualisation.

## Architecture

```
src/
  data/          api.ts (contrat) · supabaseApi.ts (prod) · demoApi.ts (démo) · logic.ts (calculs métier) · seed.ts
  lib/           permissions (RBAC) · analytics (KPI) · export (PDF/Excel) · receipt (ticket 80 mm)
  store/         Zustand : session, panier POS, préférences UI
  hooks/         TanStack Query + invalidation temps réel
  components/    ui/ (Shadcn) · layout/ · common/
  pages/         un fichier par module
supabase/
  migrations/    schéma · fonctions/RPC/triggers · polices RLS
  functions/     Edge Functions admin-users, verify-supervisor
  tests/         tests pgTAP de sécurité RLS
```

### Sécurité (Zero Trust)

- **RLS activée sur toutes les tables.** Les fonctions `user_store_ids()` et `can_access_store()` limitent chaque lecture au périmètre de boutiques de l'utilisateur ; seuls `super_admin` et `stock_manager` ont une vue réseau.
- **Aucune écriture directe sur les tables sensibles** (stock, mouvements, ventes, transferts, déclarations) : `INSERT/UPDATE/DELETE` sont révoqués et tout passe par des RPC `SECURITY DEFINER` qui vérifient rôle et boutique (`process_sale`, `stock_entry`, `adjust_stock`, `create_transfer`, `receive_transfer`, `save/submit/review_daily_report`).
- **Totaux de vente recalculés côté serveur** depuis le catalogue. Le client n'envoie que produits et quantités.
- Mouvements de stock verrouillés ligne par ligne (`FOR UPDATE`), transferts atomiques, `stock_movements` et `audit_logs` inaltérables (trigger).
- Triggers d'audit sur produits, boutiques, utilisateurs, transferts et déclarations.
- Seul le Super Admin ajoute, modifie ou supprime boutiques et utilisateurs et attribue les rôles (police RLS, RPC `delete_store` et Edge Function `admin-users`).
- Suppression **logique** (`deleted_at`) : l'élément disparaît des listes et un compte supprimé ne peut plus se connecter, mais ventes, mouvements et déclarations restent rattachés. Une boutique ne peut être supprimée qu'une fois ses transferts en transit traités et ses utilisateurs réaffectés.

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
| 11–12 | Schéma DDL, RLS, triggers | `supabase/` |

## Qualité

```bash
npm run typecheck   # TypeScript strict
npm test            # Vitest : calculs métier + étanchéité multi-boutiques
npm run build
supabase test db    # pgTAP : tests de sécurité RLS sur la base
```

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute ces étapes à chaque push et pull request.
