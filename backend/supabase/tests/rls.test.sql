-- Tests de sécurité RLS (pgTAP) — exécuter avec : supabase test db
-- Vérifie qu'un utilisateur de la boutique A ne peut ni lire ni écrire
-- les données de la boutique B via l'API (rôle `authenticated`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Jeu de données isolé
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'caisse.a@test.ci'),
  ('00000000-0000-4000-8000-0000000000b1', 'caisse.b@test.ci'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@test.ci'),
  ('00000000-0000-4000-8000-0000000000d1', 'stock@test.ci'),
  ('00000000-0000-4000-8000-0000000000e1', 'admin.boutique@test.ci');
insert into public.stores (id, code, name) values
  ('00000000-0000-4000-8000-00000000000a', 'BTQ-TA', 'Test A'),
  ('00000000-0000-4000-8000-00000000000b', 'BTQ-TB', 'Test B');
update public.users set role_id = 'cashier', store_id = '00000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-0000000000a1';
update public.users set role_id = 'cashier', store_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000b1';
update public.users set role_id = 'super_admin' where id = '00000000-0000-4000-8000-0000000000c1';
update public.users set role_id = 'stock_manager' where id = '00000000-0000-4000-8000-0000000000d1';
update public.users set role_id = 'store_admin', store_id = '00000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-0000000000e1';
insert into public.categories (id, name, code) values ('00000000-0000-4000-8000-0000000000ca', 'Test', 'TST');
insert into public.products (id, sku, name, category_id, purchase_price, selling_price)
  values ('00000000-0000-4000-8000-0000000000f1', '', 'Produit test', '00000000-0000-4000-8000-0000000000ca', 1000, 2000);
update public.inventory set quantity = 10 where product_id = '00000000-0000-4000-8000-0000000000f1';

-- Une vente dans chaque boutique (exécutée en tant que chaque caissier)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select public.process_sale('00000000-0000-4000-8000-00000000000a',
  '[{"product_id":"00000000-0000-4000-8000-0000000000f1","quantity":1}]', 0,
  '[{"method":"card","amount":2000}]');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.process_sale('00000000-0000-4000-8000-00000000000b',
  '[{"product_id":"00000000-0000-4000-8000-0000000000f1","quantity":2}]', 0,
  '[{"method":"cash","amount":4000,"amount_received":5000,"change_given":1000}]');

-- Caissier A
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((select count(*) from public.sales where store_id = '00000000-0000-4000-8000-00000000000b')::int, 0,
  'Caissier A ne lit aucune vente de la boutique B');
select is((select count(*) from public.inventory where store_id = '00000000-0000-4000-8000-00000000000b')::int, 0,
  'Caissier A ne lit pas le stock de la boutique B');
select throws_ok($$ select public.process_sale('00000000-0000-4000-8000-00000000000b',
  '[{"product_id":"00000000-0000-4000-8000-0000000000f1","quantity":1}]', 0, '[{"method":"card","amount":2000}]') $$,
  '42501', null, 'Caissier A ne peut pas encaisser pour la boutique B');
select throws_ok($$ update public.inventory set quantity = 999 $$, '42501', null,
  'Écriture directe des quantités impossible (RPC obligatoire)');
select throws_ok($$ select public.process_sale('00000000-0000-4000-8000-00000000000a',
  '[{"product_id":"00000000-0000-4000-8000-0000000000f1","quantity":1}]', 400, '[{"method":"card","amount":1600}]') $$,
  null, null, 'Remise > 15 % refusée sans superviseur');
select is_empty($$ select 1 from public.audit_logs $$, 'Journal d''audit invisible pour un caissier');

-- Gestionnaire stock : lecture réseau, pas de ventes
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}';
select is((select count(distinct store_id) from public.inventory where product_id = '00000000-0000-4000-8000-0000000000f1')::int,
  (select count(*) from public.stores)::int,
  'Gestionnaire stock voit le stock de toutes les boutiques');
select is_empty($$ select 1 from public.sales $$, 'Gestionnaire stock ne lit pas les ventes');

-- Super admin
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select is((select count(*) from public.sales where store_id in ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b'))::int, 2,
  'Super admin voit les ventes de toutes les boutiques');
select is((select sum(quantity) from public.inventory where product_id = '00000000-0000-4000-8000-0000000000f1'
  and store_id in ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b'))::int, 17,
  'Le stock a été décrémenté de façon atomique (10+10-1-2)');

-- Admin Boutique : aucune gestion des comptes ni des boutiques
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is_empty($$ update public.users set role_id = 'store_manager'
  where id = '00000000-0000-4000-8000-0000000000a1' returning 1 $$,
  'Admin Boutique ne peut pas changer le rôle d''un utilisateur');
select throws_ok($$ select public.delete_store('00000000-0000-4000-8000-00000000000b') $$, '42501', null,
  'Admin Boutique ne peut pas supprimer une boutique');
select is_empty($$ update public.stores set name = 'Piratée' where id = '00000000-0000-4000-8000-00000000000a' returning 1 $$,
  'Admin Boutique ne peut pas modifier une boutique');

-- Tout utilisateur peut modifier son propre profil, mais pas son rôle
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$ update public.users set phone = '+225 01 02 03 04' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  'Un caissier met à jour son propre profil');
select throws_ok($$ update public.users set role_id = 'super_admin' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'Un caissier ne peut pas s''attribuer un rôle');

-- Super Admin : suppression logique refusée tant qu'un utilisateur est affecté, puis acceptée
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.delete_store('00000000-0000-4000-8000-00000000000b') $$, null, null,
  'Suppression refusée tant qu''un utilisateur a la boutique comme boutique principale');
update public.users set deleted_at = now(), is_active = false where id = '00000000-0000-4000-8000-0000000000b1';
select public.delete_store('00000000-0000-4000-8000-00000000000b');
select is((select count(*) from public.sales where store_id = '00000000-0000-4000-8000-00000000000b')::int, 1,
  'La boutique supprimée garde ses ventes (historique conservé)');

select throws_ok($$ select public.save_daily_report(null, '00000000-0000-4000-8000-00000000000a', current_date, -4500, null, '[]') $$,
  '23514', null, 'Montant encaissé négatif refusé dans une déclaration');

select * from finish();
rollback;
