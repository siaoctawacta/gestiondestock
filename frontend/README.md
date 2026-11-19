# Frontend — application React

React 18 · TypeScript · Tailwind CSS · Shadcn UI · Zustand · TanStack Query.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (mode démo sans variables Supabase)
npm run typecheck
npm test
npm run build
```

Pour se connecter au backend, copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

```
src/
  data/          api.ts (contrat) · supabaseApi.ts (prod) · demoApi.ts (démo) · logic.ts · seed.ts
  lib/           permissions (RBAC) · analytics · export PDF/Excel · ticket de caisse
  store/         Zustand : session, panier POS, préférences UI
  hooks/         TanStack Query + temps réel
  components/    ui/ (Shadcn) · layout/ · common/
  pages/         un fichier par module
scripts/         generate-seed-sql.ts → ../backend/supabase/seed.sql
```

Déploiement Vercel : choisir `frontend` comme **Root Directory** du projet ; `vercel.json` (réécriture SPA, en-têtes de sécurité) est dans ce dossier.
