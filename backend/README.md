# Backend — Supabase

Tout le backend de MM Cosmétiques Stock Pro : il n'y a pas de serveur Node.js à maintenir.

```
supabase/
  migrations/   schéma PostgreSQL, fonctions RPC, triggers, polices RLS (appliquées dans l'ordre)
  functions/    Edge Functions Deno : admin-users (comptes, Super Admin), verify-supervisor (remises > 15 %)
  tests/        tests pgTAP de sécurité RLS
  seed.sql      référentiels de départ (généré, voir plus bas)
  config.toml   configuration locale du CLI Supabase
```

Les commandes du CLI Supabase se lancent **depuis ce dossier** (`backend/`) :

```bash
cd backend
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
