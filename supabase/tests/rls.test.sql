-- Tests de sécurité RLS (pgTAP) — exécuter avec : supabase test db
-- Vérifie qu'un utilisateur de la boutique A ne peut ni lire ni écrire
-- les données de la boutique B via l'API (rôle `authenticated`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Jeu de données isolé
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'caisse.a@test.ci'),
  ('00000000-0000-4000-8000-0000000000b1', 'caisse.b@test.ci'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@test.ci'),
  ('00000000-0000-4000-8000-0000000000d1', 'stock@test.ci');
insert into public.stores (id, code, name) values
  ('00000000-0000-4000-8000-00000000000a', 'BTQ-TA', 'Test A'),
  ('00000000-0000-4000-8000-00000000000b', 'BTQ-TB', 'Test B');
update public.users set role_id = 'cashier', store_id = '00000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-0000000000a1';
update public.users set role_id = 'cashier', store_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000b1';
update public.users set role_id = 'super_admin' where id = '00000000-0000-4000-8000-0000000000c1';
update public.users set role_id = 'stock_manager' where id = '00000000-0000-4000-8000-0000000000d1';
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

select * from finish();
rollback;
