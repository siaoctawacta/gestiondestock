-- =====================================================================
-- MM Cosmétiques Stock Pro — Gestion réservée au Super Admin
-- * Seul le Super Admin ajoute, modifie ou supprime boutiques et
--   utilisateurs, et attribue les rôles.
-- * Suppression logique (deleted_at) : ventes, mouvements, déclarations
--   et journal d'audit restent rattachés à la boutique / au compte.
-- =====================================================================

alter table public.stores add column if not exists deleted_at timestamptz;
alter table public.users  add column if not exists deleted_at timestamptz;

-- Un code boutique ne doit être unique que parmi les boutiques non supprimées
alter table public.stores drop constraint if exists stores_code_key;
create unique index if not exists stores_code_live_key on public.stores (code) where deleted_at is null;

-- Un compte supprimé n'a plus aucun périmètre ; une boutique supprimée n'en fait plus partie
create or replace function public.current_role_id()
returns text language sql stable security definer set search_path = public as $$
  select role_id from public.users where id = auth.uid() and is_active and deleted_at is null
$$;

create or replace function public.user_store_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select u.store_id from public.users u
    join public.stores s on s.id = u.store_id and s.deleted_at is null
   where u.id = auth.uid() and u.is_active and u.deleted_at is null
  union
  select us.store_id from public.user_stores us
    join public.users u on u.id = us.user_id
    join public.stores s on s.id = us.store_id and s.deleted_at is null
   where us.user_id = auth.uid() and u.is_active and u.deleted_at is null
$$;

-- ---------------------------------------------------------------------
-- Utilisateurs : écriture par le Super Admin uniquement
-- (l'Edge Function admin-users fait le même contrôle côté serveur)
-- ---------------------------------------------------------------------
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Un utilisateur peut modifier son profil, jamais son rôle, sa boutique ni son statut.
-- Correctif : la version initiale relisait public.users dans la police elle-même, ce que
-- PostgreSQL rejette (« infinite recursion detected in policy »). On passe par des fonctions
-- SECURITY DEFINER, qui lisent la ligne stockée sans réappliquer la RLS.
create or replace function public.my_stored_role()
returns text language sql stable security definer set search_path = public as $$
  select role_id from public.users where id = auth.uid()
$$;
create or replace function public.my_stored_store()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.users where id = auth.uid()
$$;

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (
    id = auth.uid()
    and role_id = public.my_stored_role()
    and store_id is not distinct from public.my_stored_store()
    and is_active
    and deleted_at is null
  );

-- Pas de suppression physique depuis l'API : l'historique doit rester rattaché
revoke delete on public.stores, public.users from anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC : suppression logique d'une boutique
-- ---------------------------------------------------------------------
create or replace function public.delete_store(p_store uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.stores;
  v_users int;
begin
  if not public.is_super_admin() then
    raise exception 'Action réservée au Super Admin' using errcode = '42501';
  end if;

  select * into s from public.stores where id = p_store and deleted_at is null for update;
  if s.id is null then raise exception 'Boutique introuvable ou déjà supprimée'; end if;

  if exists (select 1 from public.stock_transfers
              where status = 'in_transit' and (source_store_id = p_store or dest_store_id = p_store)) then
    raise exception 'Des transferts sont en transit avec cette boutique : réceptionnez-les ou annulez-les d''abord';
  end if;

  select count(*) into v_users from public.users where store_id = p_store and deleted_at is null;
  if v_users > 0 then
    raise exception '% utilisateur(s) ont cette boutique comme boutique principale : réaffectez-les ou supprimez-les d''abord', v_users;
  end if;

  update public.stores set deleted_at = now(), is_active = false, manager_id = null where id = p_store;
  delete from public.user_stores where store_id = p_store;

  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'DELETE', 'stores', p_store, format('Suppression de %s (historique conservé)', s.name));
end $$;

grant execute on function public.delete_store(uuid) to authenticated;
