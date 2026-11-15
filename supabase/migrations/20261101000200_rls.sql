-- =====================================================================
-- MM Cosmétiques Stock Pro — Row Level Security (Zero Trust)
-- RLS activée sur TOUTES les tables. Les écritures de stock, ventes,
-- transferts et déclarations passent exclusivement par les RPC
-- SECURITY DEFINER (aucune police INSERT/UPDATE directe).
-- =====================================================================

alter table public.roles              enable row level security;
alter table public.users              enable row level security;
alter table public.user_stores        enable row level security;
alter table public.stores             enable row level security;
alter table public.categories         enable row level security;
alter table public.suppliers          enable row level security;
alter table public.products           enable row level security;
alter table public.inventory          enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.stock_transfers    enable row level security;
alter table public.transfer_items     enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.payments           enable row level security;
alter table public.daily_reports      enable row level security;
alter table public.report_expenses    enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.audit_logs         enable row level security;

-- ---------------- Référentiels lisibles par tout utilisateur connecté
create policy roles_read on public.roles for select to authenticated using (true);
create policy stores_read on public.stores for select to authenticated using (true);
create policy categories_read on public.categories for select to authenticated using (true);
create policy suppliers_read on public.suppliers for select to authenticated using (true);
create policy products_read on public.products for select to authenticated using (true);

-- ---------------- Écritures référentiels
create policy stores_write on public.stores for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy categories_write on public.categories for all to authenticated
  using (public.has_role('super_admin','store_admin','stock_manager'))
  with check (public.has_role('super_admin','store_admin','stock_manager'));

create policy suppliers_write on public.suppliers for all to authenticated
  using (public.has_role('super_admin','store_admin','stock_manager'))
  with check (public.has_role('super_admin','store_admin','stock_manager'));

create policy products_insert on public.products for insert to authenticated
  with check (public.has_role('super_admin','store_admin','stock_manager'));
create policy products_update on public.products for update to authenticated
  using (public.has_role('super_admin','store_admin','stock_manager'))
  with check (public.has_role('super_admin','store_admin','stock_manager'));

-- ---------------- Utilisateurs
create policy users_read on public.users for select to authenticated using (
  id = auth.uid()
  or public.is_super_admin()
  or (public.has_role('store_admin','store_manager','pole_chief') and store_id in (select public.user_store_ids()))
);
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- un utilisateur ne peut pas modifier son propre rôle / boutique / statut
    and role_id = (select role_id from public.users where id = auth.uid())
    and store_id is not distinct from (select store_id from public.users where id = auth.uid())
    and is_active
  );
create policy users_admin_write on public.users for update to authenticated
  using (
    public.is_super_admin()
    or (public.has_role('store_admin') and store_id in (select public.user_store_ids()))
  )
  with check (
    public.is_super_admin()
    or (public.has_role('store_admin')
        and store_id in (select public.user_store_ids())
        and role_id in ('store_manager','cashier','stock_manager'))
  );

create policy user_stores_read on public.user_stores for select to authenticated
  using (user_id = auth.uid() or public.has_role('super_admin','store_admin'));
create policy user_stores_write on public.user_stores for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------- Stock (lecture seule ; écritures via RPC)
create policy inventory_read on public.inventory for select to authenticated
  using (public.can_access_store(store_id));
create policy inventory_min_update on public.inventory for update to authenticated
  using (public.can_access_store(store_id) and public.has_role('super_admin','store_admin','store_manager','stock_manager'))
  with check (public.can_access_store(store_id));

-- Seule la colonne min_stock_level est modifiable directement ; les quantités
-- ne bougent que via les RPC (apply_stock_movement).
revoke insert, update, delete on public.inventory from anon, authenticated;
grant update (min_stock_level) on public.inventory to authenticated;
revoke insert, update, delete on public.stock_movements, public.sales, public.sale_items, public.payments,
  public.stock_transfers, public.transfer_items, public.daily_reports, public.report_expenses,
  public.notifications, public.audit_logs from anon, authenticated;

create policy movements_read on public.stock_movements for select to authenticated
  using (public.can_access_store(store_id));

create policy transfers_read on public.stock_transfers for select to authenticated
  using (public.can_access_store(source_store_id) or public.can_access_store(dest_store_id));
create policy transfer_items_read on public.transfer_items for select to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id
                 and (public.can_access_store(t.source_store_id) or public.can_access_store(t.dest_store_id))));

-- ---------------- Ventes : un caissier ne voit que SES ventes, dans SA boutique
create policy "sales_store_isolation"
-- Caissiers et managers ne voient que les ventes de leur boutique
on public.sales for select to authenticated using (
  public.is_super_admin()
  or (
    public.can_access_store(store_id)
    and not public.has_role('stock_manager')
    and (not public.has_role('cashier') or cashier_id = auth.uid())
  )
);
create policy sale_items_read on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

-- ---------------- Déclarations
create policy daily_reports_read on public.daily_reports for select to authenticated using (
  public.can_access_store(store_id)
  and public.has_role('super_admin','store_admin','store_manager','pole_chief')
);
create policy report_expenses_read on public.report_expenses for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = daily_report_id));

-- ---------------- Notifications
create policy notifications_read on public.notifications for select to authenticated using (
  case
    when user_id is not null then user_id = auth.uid()
    else (target_roles is null or public.current_role_id() = any(target_roles))
         and (store_id is null or public.can_access_store(store_id))
  end
);
create policy notification_reads_own on public.notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------- Audit : super admin uniquement, lecture seule
create policy audit_read on public.audit_logs for select to authenticated
  using (public.is_super_admin());

-- ---------------- Storage
create policy "product images read" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role('super_admin','store_admin','stock_manager'));
create policy "expense receipts rw" on storage.objects for all to authenticated
  using (bucket_id = 'expense-receipts' and public.has_role('super_admin','store_admin','pole_chief'))
  with check (bucket_id = 'expense-receipts' and public.has_role('super_admin','store_admin','pole_chief'));

-- ---------------- RPC exposées aux utilisateurs connectés
grant execute on function
  public.stock_entry(uuid, uuid, int, text, date, text),
  public.adjust_stock(uuid, uuid, int, text, text),
  public.process_sale(uuid, jsonb, numeric, jsonb, uuid),
  public.create_transfer(uuid, uuid, jsonb, text),
  public.receive_transfer(uuid),
  public.cancel_transfer(uuid),
  public.pos_theoretical_amount(uuid, date),
  public.save_daily_report(uuid, uuid, date, numeric, text, jsonb),
  public.submit_daily_report(uuid),
  public.review_daily_report(uuid, boolean, text),
  public.touch_last_login(),
  public.supervisor_can_approve(uuid)
to authenticated;

-- ---------------- Temps réel
alter publication supabase_realtime add table
  public.inventory, public.notifications, public.sales, public.stock_transfers, public.daily_reports;
