-- =====================================================================
-- MMCG Stock Pro — Fonctions métier, triggers et RPC
-- Toutes les opérations de stock passent par des fonctions
-- SECURITY DEFINER qui vérifient elles-mêmes les habilitations :
-- le client n'écrit jamais directement dans inventory / stock_movements.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers d'habilitation (utilisés par les polices RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_role_id()
returns text language sql stable security definer set search_path = public as $$
  select role_id from public.users where id = auth.uid() and is_active
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_id() = 'super_admin', false)
$$;

-- Toutes les boutiques visibles : null = réseau entier
create or replace function public.has_global_scope()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_id() in ('super_admin','stock_manager'), false)
$$;

create or replace function public.user_store_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select store_id from public.users where id = auth.uid() and store_id is not null and is_active
  union
  select us.store_id from public.user_stores us
    join public.users u on u.id = us.user_id
   where us.user_id = auth.uid() and u.is_active
$$;

create or replace function public.can_access_store(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_global_scope() or p_store in (select public.user_store_ids())
$$;

create or replace function public.has_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_id() = any(p_roles), false)
$$;

create or replace function public.assert_role(variadic p_roles text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(variadic p_roles) then
    raise exception 'Action non autorisée pour votre rôle' using errcode = '42501';
  end if;
end $$;

create or replace function public.assert_store(p_store uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_store(p_store) then
    raise exception 'Boutique hors de votre périmètre' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Références lisibles (TK-PLT-000123, TRF-000045)
-- ---------------------------------------------------------------------
create sequence if not exists public.sale_ref_seq;
create sequence if not exists public.transfer_ref_seq;

-- ---------------------------------------------------------------------
-- Génération automatique du SKU : COSM-<CAT>-0001
-- ---------------------------------------------------------------------
create or replace function public.trg_products_sku()
returns trigger language plpgsql as $$
declare
  v_code text;
  v_next int;
begin
  if new.sku is null or new.sku = '' then
    select coalesce(code, 'GEN') into v_code from public.categories where id = new.category_id;
    v_code := coalesce(v_code, 'GEN');
    perform pg_advisory_xact_lock(hashtext('sku-' || v_code));
    select coalesce(max(substring(sku from '\d+$')::int), 0) + 1 into v_next
      from public.products where sku like 'COSM-' || v_code || '-%';
    new.sku := 'COSM-' || v_code || '-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end $$;

create trigger products_sku before insert on public.products
  for each row execute function public.trg_products_sku();

-- Chaque nouveau produit / boutique crée ses lignes d'inventaire à 0
create or replace function public.trg_products_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (store_id, product_id)
  select s.id, new.id from public.stores s
  on conflict do nothing;
  return new;
end $$;
create trigger products_inventory after insert on public.products
  for each row execute function public.trg_products_inventory();

create or replace function public.trg_stores_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (store_id, product_id)
  select new.id, p.id from public.products p
  on conflict do nothing;
  return new;
end $$;
create trigger stores_inventory after insert on public.stores
  for each row execute function public.trg_stores_inventory();

-- ---------------------------------------------------------------------
-- Mouvement de stock atomique (verrou de ligne)
-- ---------------------------------------------------------------------
create or replace function public.apply_stock_movement(
  p_store uuid, p_product uuid, p_qty int, p_type text,
  p_reason text default null, p_lot text default null, p_expiry date default null, p_reference text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_current int;
  v_name text;
begin
  insert into public.inventory (store_id, product_id) values (p_store, p_product)
    on conflict (store_id, product_id) do nothing;

  select quantity into v_current from public.inventory
   where store_id = p_store and product_id = p_product
   for update;

  if v_current + p_qty < 0 then
    select name into v_name from public.products where id = p_product;
    raise exception 'Stock insuffisant pour « % » (disponible : %)', v_name, v_current
      using errcode = 'P0001';
  end if;

  update public.inventory
     set quantity = quantity + p_qty, updated_at = now()
   where store_id = p_store and product_id = p_product;

  insert into public.stock_movements (product_id, store_id, user_id, type, quantity, reason, lot_number, expiry_date, reference)
  values (p_product, p_store, auth.uid(), p_type, p_qty, p_reason, p_lot, p_expiry, p_reference);
end $$;
revoke execute on function public.apply_stock_movement from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC : entrée de stock (réception marchandise avec lot & péremption)
-- ---------------------------------------------------------------------
create or replace function public.stock_entry(
  p_store uuid, p_product uuid, p_qty int, p_lot text, p_expiry date, p_reference text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role('super_admin','store_admin','store_manager','stock_manager');
  perform public.assert_store(p_store);
  if p_qty <= 0 then raise exception 'La quantité doit être positive'; end if;
  if coalesce(trim(p_lot), '') = '' then raise exception 'Le numéro de lot est obligatoire'; end if;
  perform public.apply_stock_movement(p_store, p_product, p_qty, 'entry', 'Réception marchandise', p_lot, p_expiry, p_reference);
end $$;

-- ---------------------------------------------------------------------
-- RPC : ajustement (casse, vol, péremption, testeur…) — motif obligatoire
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_store uuid, p_product uuid, p_qty int, p_reason text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role('super_admin','store_admin','store_manager','stock_manager');
  perform public.assert_store(p_store);
  if p_qty = 0 then raise exception 'Quantité nulle'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Motif obligatoire'; end if;
  perform public.apply_stock_movement(p_store, p_product, p_qty, 'adjustment',
    p_reason || coalesce(' — ' || nullif(trim(p_note), ''), ''));
  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'ADJUST', 'inventory', p_product, format('Ajustement %s (%s)', p_qty, p_reason));
end $$;

-- ---------------------------------------------------------------------
-- RPC : vente POS (totaux recalculés côté serveur depuis le catalogue)
--   p_items    : [{"product_id": uuid, "quantity": int}]
--   p_payments : [{"method": "cash", "provider": null, "amount": 1000, "amount_received": 2000, "change_given": 1000}]
-- ---------------------------------------------------------------------
create or replace function public.process_sale(
  p_store uuid, p_items jsonb, p_discount numeric, p_payments jsonb, p_supervisor uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_store_code text;
  v_ref text;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_ratio numeric;
  v_tax numeric := 0;
  v_total numeric;
  v_paid numeric;
  v_item record;
begin
  perform public.assert_role('super_admin','store_admin','store_manager','cashier');
  perform public.assert_store(p_store);

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide';
  end if;

  select coalesce(sum(p.selling_price * (i->>'quantity')::int), 0) into v_subtotal
    from jsonb_array_elements(p_items) i
    join public.products p on p.id = (i->>'product_id')::uuid and p.is_active;

  v_discount := least(greatest(round(coalesce(p_discount, 0)), 0), v_subtotal);

  -- Remise > 15 % : superviseur obligatoire si le vendeur n'est pas habilité
  if v_subtotal > 0 and v_discount / v_subtotal > 0.15
     and not public.has_role('super_admin','store_admin','store_manager') then
    if p_supervisor is null or not exists (
      select 1 from public.users where id = p_supervisor and is_active
        and role_id in ('super_admin','store_admin','store_manager')
    ) then
      raise exception 'Remise supérieure à 15 %% : validation superviseur requise';
    end if;
  end if;

  v_total := v_subtotal - v_discount;
  v_ratio := case when v_subtotal > 0 then v_total / v_subtotal else 0 end;

  select coalesce(sum((p->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payments) p;
  if round(v_paid) <> round(v_total) then
    raise exception 'Le montant réglé (%) ne correspond pas au total (%)', v_paid, v_total;
  end if;

  select code into v_store_code from public.stores where id = p_store;
  v_ref := 'TK-' || replace(v_store_code, 'BTQ-', '') || '-' || lpad(nextval('public.sale_ref_seq')::text, 6, '0');

  insert into public.sales (id, reference, store_id, cashier_id, supervisor_id, subtotal, discount_amount, tax_amount, total)
  values (v_sale_id, v_ref, p_store, auth.uid(), p_supervisor, v_subtotal, v_discount, 0, v_total);

  for v_item in
    select p.id, p.name, p.selling_price, p.purchase_price, p.vat_rate, sum((i->>'quantity')::int) as qty
      from jsonb_array_elements(p_items) i
      join public.products p on p.id = (i->>'product_id')::uuid
     group by p.id
  loop
    insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, purchase_price, vat_rate, line_total)
    values (v_sale_id, v_item.id, v_item.name, v_item.qty, v_item.selling_price, v_item.purchase_price, v_item.vat_rate,
            v_item.selling_price * v_item.qty);
    v_tax := v_tax + (v_item.selling_price * v_item.qty * v_ratio) * v_item.vat_rate / (100 + v_item.vat_rate);
    perform public.apply_stock_movement(p_store, v_item.id, -v_item.qty::int, 'sale', null, null, null, v_ref);
  end loop;

  update public.sales set tax_amount = round(v_tax) where id = v_sale_id;

  insert into public.payments (sale_id, method, provider, amount, amount_received, change_given)
  select v_sale_id, p->>'method', nullif(p->>'provider', ''), (p->>'amount')::numeric,
         nullif(p->>'amount_received', '')::numeric, nullif(p->>'change_given', '')::numeric
    from jsonb_array_elements(p_payments) p;

  if v_subtotal > 0 and v_discount / v_subtotal > 0.15 then
    insert into public.audit_logs (user_id, action, entity, entity_id, details)
    values (auth.uid(), 'DISCOUNT', 'sales', v_sale_id,
            format('Remise de %s %% sur %s', round(v_discount / v_subtotal * 100, 1), v_ref));
  end if;

  return v_sale_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC : transferts inter-boutiques (workflow en 2 étapes)
-- ---------------------------------------------------------------------
create or replace function public.create_transfer(
  p_source uuid, p_dest uuid, p_items jsonb, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_ref text := 'TRF-' || lpad(nextval('public.transfer_ref_seq')::text, 6, '0');
  v_bad text;
begin
  perform public.assert_role('super_admin','store_admin','stock_manager');
  perform public.assert_store(p_source);
  if p_source = p_dest then raise exception 'Boutiques source et destination identiques'; end if;

  -- Disponibilité = stock − quantités déjà en transit depuis la source
  select p.name into v_bad
    from jsonb_array_elements(p_items) i
    join public.products p on p.id = (i->>'product_id')::uuid
    left join public.inventory inv on inv.store_id = p_source and inv.product_id = p.id
   where coalesce(inv.quantity, 0) - coalesce((
           select sum(ti.quantity) from public.transfer_items ti
             join public.stock_transfers t on t.id = ti.transfer_id
            where t.status = 'in_transit' and t.source_store_id = p_source and ti.product_id = p.id
         ), 0) < (i->>'quantity')::int
   limit 1;
  if v_bad is not null then
    raise exception 'Stock disponible insuffisant pour « % »', v_bad;
  end if;

  insert into public.stock_transfers (id, reference, source_store_id, dest_store_id, notes, created_by)
  values (v_id, v_ref, p_source, p_dest, p_notes, auth.uid());

  insert into public.transfer_items (transfer_id, product_id, quantity)
  select v_id, (i->>'product_id')::uuid, (i->>'quantity')::int
    from jsonb_array_elements(p_items) i where (i->>'quantity')::int > 0;

  insert into public.notifications (store_id, target_roles, type, severity, title, message)
  select p_dest, array['super_admin','store_admin','store_manager','stock_manager'], 'transfer', 'info',
         'Transfert en transit', format('%s : %s → %s. À réceptionner.', v_ref, s.name, d.name)
    from public.stores s, public.stores d where s.id = p_source and d.id = p_dest;

  return v_id;
end $$;

create or replace function public.receive_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.stock_transfers;
  it record;
begin
  perform public.assert_role('super_admin','store_admin','store_manager','stock_manager');
  select * into t from public.stock_transfers where id = p_transfer for update;
  if t.id is null or t.status <> 'in_transit' then
    raise exception 'Transfert introuvable ou déjà traité';
  end if;
  perform public.assert_store(t.dest_store_id);

  -- Débit source + crédit destination dans la même transaction
  for it in select * from public.transfer_items where transfer_id = p_transfer loop
    perform public.apply_stock_movement(t.source_store_id, it.product_id, -it.quantity, 'transfer_out', null, null, null, t.reference);
    perform public.apply_stock_movement(t.dest_store_id,   it.product_id,  it.quantity, 'transfer_in',  null, null, null, t.reference);
  end loop;

  update public.stock_transfers
     set status = 'received', received_by = auth.uid(), received_at = now()
   where id = p_transfer;
end $$;

create or replace function public.cancel_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.stock_transfers;
begin
  perform public.assert_role('super_admin','store_admin','stock_manager');
  select * into t from public.stock_transfers where id = p_transfer for update;
  if t.status <> 'in_transit' then raise exception 'Seuls les transferts en transit peuvent être annulés'; end if;
  perform public.assert_store(t.source_store_id);
  update public.stock_transfers set status = 'cancelled' where id = p_transfer;
end $$;

-- ---------------------------------------------------------------------
-- Déclarations journalières
-- ---------------------------------------------------------------------
create or replace function public.pos_theoretical_amount(p_store uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(total), 0) from public.sales
   where store_id = p_store and status = 'completed'
     and public.can_access_store(p_store)
     and (created_at at time zone 'Africa/Abidjan')::date = p_date
$$;

-- Recalcule théorique + écart à chaque écriture
create or replace function public.trg_daily_reports_compute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.theoretical_amount := public.pos_theoretical_amount(new.store_id, new.report_date);
  select coalesce(sum(amount), 0) into new.expenses_total from public.report_expenses where daily_report_id = new.id;
  new.variance := new.declared_amount + new.expenses_total - new.theoretical_amount;
  new.variance_pct := case when new.theoretical_amount > 0
                           then round(new.variance / new.theoretical_amount * 100, 2) else 0 end;
  return new;
end $$;
create trigger daily_reports_compute before insert or update on public.daily_reports
  for each row execute function public.trg_daily_reports_compute();

create or replace function public.save_daily_report(
  p_id uuid, p_store uuid, p_date date, p_declared numeric, p_notes text, p_expenses jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
        v_status text;
begin
  perform public.assert_role('super_admin','pole_chief');
  perform public.assert_store(p_store);
  if p_id is not null then
    select status into v_status from public.daily_reports where id = p_id for update;
    if v_status not in ('draft','rejected') then
      raise exception 'Une déclaration envoyée ne peut plus être modifiée';
    end if;
    delete from public.report_expenses where daily_report_id = p_id;
  else
    insert into public.daily_reports (id, store_id, user_id, report_date, declared_amount, notes)
    values (v_id, p_store, auth.uid(), p_date, p_declared, p_notes);
  end if;

  insert into public.report_expenses (daily_report_id, label, category, amount)
  select v_id, e->>'label', coalesce(e->>'category', 'Divers'), (e->>'amount')::numeric
    from jsonb_array_elements(coalesce(p_expenses, '[]'::jsonb)) e
   where coalesce(e->>'label', '') <> '' and (e->>'amount')::numeric > 0;

  update public.daily_reports
     set report_date = p_date, declared_amount = p_declared, notes = p_notes,
         status = 'draft', rejection_reason = null
   where id = v_id;
  return v_id;
end $$;

create or replace function public.submit_daily_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.daily_reports; v_store text; v_user text;
begin
  perform public.assert_role('super_admin','pole_chief');
  select * into r from public.daily_reports where id = p_id for update;
  perform public.assert_store(r.store_id);
  if r.status not in ('draft','rejected') then raise exception 'Déclaration déjà envoyée'; end if;
  update public.daily_reports set status = 'submitted' where id = p_id returning * into r;

  select name into v_store from public.stores where id = r.store_id;
  select first_name || ' ' || last_name into v_user from public.users where id = auth.uid();
  insert into public.notifications (store_id, target_roles, type, severity, title, message)
  values (r.store_id, array['super_admin','store_admin'], 'daily_report', 'info', 'Nouvelle déclaration',
          format('%s a soumis la déclaration du %s — %s.', v_user, r.report_date, v_store));
  if abs(r.variance_pct) > 2 then
    insert into public.notifications (store_id, target_roles, type, severity, title, message)
    values (r.store_id, array['super_admin','store_admin'], 'cash_variance', 'critical', 'Écart de caisse',
            format('Écart de %s %% (%s F) sur %s le %s.', r.variance_pct, round(r.variance), v_store, r.report_date));
  end if;
end $$;

create or replace function public.review_daily_report(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.daily_reports;
begin
  perform public.assert_role('super_admin','store_admin');
  select * into r from public.daily_reports where id = p_id for update;
  perform public.assert_store(r.store_id);
  if r.status <> 'submitted' then raise exception 'Seules les déclarations envoyées peuvent être traitées'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'Le motif de rejet est obligatoire'; end if;

  update public.daily_reports
     set status = case when p_approve then 'validated' else 'rejected' end,
         rejection_reason = case when p_approve then null else p_reason end,
         validated_by = auth.uid(), validated_at = now()
   where id = p_id;

  insert into public.notifications (user_id, store_id, type, severity, title, message)
  values (r.user_id, r.store_id, 'report_status', case when p_approve then 'info' else 'warning' end,
          case when p_approve then 'Déclaration validée' else 'Déclaration rejetée' end,
          case when p_approve then format('Votre déclaration du %s a été validée.', r.report_date)
               else format('Déclaration du %s à corriger : %s', r.report_date, p_reason) end);
end $$;

-- ---------------------------------------------------------------------
-- Moteur d'alertes stock (trigger sur inventory)
-- ---------------------------------------------------------------------
create or replace function public.trg_inventory_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_min int;
  v_product text;
  v_store text;
  v_roles text[] := array['super_admin','store_admin','store_manager','stock_manager'];
begin
  select coalesce(new.min_stock_level, p.min_stock_level), p.name into v_min, v_product
    from public.products p where p.id = new.product_id;
  select name into v_store from public.stores where id = new.store_id;

  if new.quantity = 0 and old.quantity > 0 then
    insert into public.notifications (store_id, target_roles, type, severity, title, message)
    values (new.store_id, v_roles, 'out_of_stock', 'critical', 'Rupture de stock',
            format('%s est épuisé à %s.', v_product, v_store));
  elsif new.quantity <= v_min and old.quantity > v_min then
    insert into public.notifications (store_id, target_roles, type, severity, title, message)
    values (new.store_id, v_roles, 'low_stock', 'warning', 'Stock faible',
            format('%s : %s unité(s) restante(s) à %s.', v_product, new.quantity, v_store));
  end if;
  return new;
end $$;
create trigger inventory_alerts after update of quantity on public.inventory
  for each row execute function public.trg_inventory_alerts();

-- ---------------------------------------------------------------------
-- Audit automatique des tables sensibles
-- ---------------------------------------------------------------------
create or replace function public.trg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_details text;
begin
  v_id := case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(new)->>'id')::uuid end;
  if tg_op = 'UPDATE' then
    select string_agg(format('%s : %s → %s', n.key, o.value, n.value), ' · ')
      into v_details
      from jsonb_each_text(to_jsonb(new)) n
      join jsonb_each_text(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and n.key not in ('updated_at','last_login_at');
    if v_details is null then return new; end if;
  elsif tg_op = 'INSERT' then
    v_details := coalesce(to_jsonb(new)->>'name', to_jsonb(new)->>'email', to_jsonb(new)->>'reference', 'Création');
  else
    v_details := coalesce(to_jsonb(old)->>'name', to_jsonb(old)->>'email', 'Suppression');
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), tg_op, tg_table_name, v_id, left(v_details, 1000));
  return coalesce(new, old);
end $$;

create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.trg_audit();
create trigger audit_stores after insert or update or delete on public.stores
  for each row execute function public.trg_audit();
create trigger audit_users after insert or update or delete on public.users
  for each row execute function public.trg_audit();
create trigger audit_transfers after insert or update on public.stock_transfers
  for each row execute function public.trg_audit();
create trigger audit_daily_reports after update of status on public.daily_reports
  for each row execute function public.trg_audit();

-- Journal inaltérable : interdit UPDATE/DELETE même pour le service
create or replace function public.trg_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Table % en lecture seule (journal inaltérable)', tg_table_name;
end $$;
create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.trg_immutable();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.trg_immutable();

-- ---------------------------------------------------------------------
-- Profil créé automatiquement à l'inscription (métadonnées Auth)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, first_name, last_name, phone, role_id, store_id)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role', 'cashier'),
    nullif(new.raw_user_meta_data->>'store_id', '')::uuid
  ) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Horodatage de dernière connexion
create or replace function public.touch_last_login()
returns void language sql security definer set search_path = public as $$
  update public.users set last_login_at = now() where id = auth.uid();
$$;

-- Vérification superviseur (remise > 15 %) : l'Edge Function `verify-supervisor`
-- authentifie le superviseur ; cette RPC confirme son habilitation.
create or replace function public.supervisor_can_approve(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = p_user and is_active
                   and role_id in ('super_admin','store_admin','store_manager'))
$$;

-- ---------------------------------------------------------------------
-- Optionnel : Custom Access Token Hook — expose role & store_id dans le JWT
-- (Dashboard > Authentication > Hooks). Utile aux Edge Functions.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  u public.users;
begin
  select * into u from public.users where id = (event->>'user_id')::uuid;
  if u.id is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(u.role_id));
    claims := jsonb_set(claims, '{store_id}', coalesce(to_jsonb(u.store_id::text), 'null'::jsonb));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;
