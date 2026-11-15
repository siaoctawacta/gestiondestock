-- =====================================================================
-- MM Cosmétiques Stock Pro — Schéma relationnel PostgreSQL (Supabase)
-- 15 tables métier du cahier des charges + 3 tables de support
-- (user_stores, stock_transfers, transfer_items).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. roles
-- ---------------------------------------------------------------------
create table public.roles (
  id          text primary key,           -- 'super_admin', 'cashier', ...
  label       text not null,
  level       int  not null
);

insert into public.roles (id, label, level) values
  ('super_admin',   'Super Admin',          1),
  ('store_admin',   'Admin Boutique',       2),
  ('store_manager', 'Responsable Boutique', 3),
  ('pole_chief',    'Chef de Pôle',         4),
  ('cashier',       'Caissier',             5),
  ('stock_manager', 'Gestionnaire Stock',   6);

-- ---------------------------------------------------------------------
-- 3. stores (créée avant users ; manager_id ajouté ensuite)
-- ---------------------------------------------------------------------
create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  code        varchar(20) unique not null,
  name        varchar(255) not null,
  address     text not null default '',
  phone       varchar(50) not null default '',
  email       varchar(255) not null default '',
  region      varchar(100) not null default '',
  manager_id  uuid,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. users (profil métier lié à auth.users)
-- ---------------------------------------------------------------------
create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  first_name     varchar(100) not null,
  last_name      varchar(100) not null,
  email          varchar(255) unique not null,
  phone          varchar(50),
  role_id        text not null references public.roles(id) default 'cashier',
  store_id       uuid references public.stores(id) on delete set null,
  is_active      boolean not null default true,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index users_store_idx on public.users(store_id);
create index users_role_idx  on public.users(role_id);

alter table public.stores
  add constraint stores_manager_fk foreign key (manager_id) references public.users(id) on delete set null;

-- Affectations multi-boutiques (Admin Boutique, Chef de Pôle)
create table public.user_stores (
  user_id   uuid not null references public.users(id) on delete cascade,
  store_id  uuid not null references public.stores(id) on delete cascade,
  primary key (user_id, store_id)
);

-- ---------------------------------------------------------------------
-- 4. categories / 5. suppliers
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null,
  code       varchar(3)   not null unique,
  parent_id  uuid references public.categories(id) on delete set null
);

create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(255) not null,
  contact_name  varchar(255) not null default '',
  phone         varchar(50)  not null default '',
  email         varchar(255) not null default '',
  address       text         not null default ''
);

-- ---------------------------------------------------------------------
-- 6. products
-- ---------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              varchar(50) unique not null,
  barcode          varchar(100) unique,
  name             varchar(255) not null,
  brand            varchar(100) not null default '',
  description      text not null default '',
  packaging        varchar(100) not null default '',
  category_id      uuid references public.categories(id),
  supplier_id      uuid references public.suppliers(id),
  purchase_price   numeric(12,2) not null check (purchase_price >= 0),
  selling_price    numeric(12,2) not null check (selling_price >= purchase_price),
  vat_rate         numeric(5,2)  not null default 18 check (vat_rate between 0 and 100),
  min_stock_level  int not null default 5 check (min_stock_level >= 0),
  image_url        text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_name_trgm_idx on public.products using gin (to_tsvector('french', name));

-- ---------------------------------------------------------------------
-- 7. inventory
-- ---------------------------------------------------------------------
create table public.inventory (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  product_id       uuid not null references public.products(id) on delete cascade,
  quantity         int  not null default 0 check (quantity >= 0),
  min_stock_level  int  check (min_stock_level >= 0),   -- surcharge par boutique
  updated_at       timestamptz not null default now(),
  unique (store_id, product_id)
);
create index inventory_store_idx on public.inventory(store_id);

-- ---------------------------------------------------------------------
-- 8. stock_movements (journal inaltérable)
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id),
  store_id     uuid not null references public.stores(id),
  user_id      uuid references public.users(id),
  type         text not null check (type in ('entry','sale','adjustment','transfer_out','transfer_in')),
  quantity     int  not null check (quantity <> 0),
  reason       text,
  lot_number   varchar(100),
  expiry_date  date,
  reference    varchar(100),
  created_at   timestamptz not null default now()
);
create index stock_movements_store_idx on public.stock_movements(store_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements(product_id);

-- Transferts inter-boutiques
create table public.stock_transfers (
  id               uuid primary key default gen_random_uuid(),
  reference        varchar(30) unique not null,
  source_store_id  uuid not null references public.stores(id),
  dest_store_id    uuid not null references public.stores(id),
  status           text not null default 'in_transit' check (status in ('in_transit','received','cancelled')),
  notes            text,
  created_by       uuid not null references public.users(id),
  received_by      uuid references public.users(id),
  created_at       timestamptz not null default now(),
  received_at      timestamptz,
  check (source_store_id <> dest_store_id)
);

create table public.transfer_items (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references public.stock_transfers(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  quantity     int  not null check (quantity > 0)
);

-- ---------------------------------------------------------------------
-- 9. sales / 10. sale_items / 11. payments
-- ---------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  reference        varchar(30) unique not null,
  store_id         uuid not null references public.stores(id),
  cashier_id       uuid not null references public.users(id),
  supervisor_id    uuid references public.users(id),
  subtotal         numeric(12,2) not null,
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount       numeric(12,2) not null,
  total            numeric(12,2) not null check (total >= 0),
  status           text not null default 'completed' check (status in ('completed','refunded')),
  created_at       timestamptz not null default now()
);
create index sales_store_date_idx on public.sales(store_id, created_at desc);
create index sales_cashier_idx on public.sales(cashier_id);

create table public.sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.sales(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  product_name    varchar(255) not null,
  quantity        int not null check (quantity > 0),
  unit_price      numeric(12,2) not null,
  purchase_price  numeric(12,2) not null,
  vat_rate        numeric(5,2)  not null,
  line_total      numeric(12,2) not null
);
create index sale_items_sale_idx on public.sale_items(sale_id);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid not null references public.sales(id) on delete cascade,
  method           text not null check (method in ('cash','mobile_money','card')),
  provider         text check (provider in ('wave','orange_money','mtn')),
  amount           numeric(12,2) not null check (amount >= 0),
  amount_received  numeric(12,2),
  change_given     numeric(12,2)
);
create index payments_sale_idx on public.payments(sale_id);

-- ---------------------------------------------------------------------
-- 12. daily_reports / 13. report_expenses
-- ---------------------------------------------------------------------
create table public.daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id),
  user_id             uuid not null references public.users(id),
  report_date         date not null,
  theoretical_amount  numeric(12,2) not null default 0,
  declared_amount     numeric(12,2) not null default 0,
  expenses_total      numeric(12,2) not null default 0,
  variance            numeric(12,2) not null default 0,
  variance_pct        numeric(7,2)  not null default 0,
  status              text not null default 'draft' check (status in ('draft','submitted','validated','rejected')),
  notes               text,
  rejection_reason    text,
  validated_by        uuid references public.users(id),
  validated_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (store_id, report_date)
);

create table public.report_expenses (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports(id) on delete cascade,
  label            varchar(255) not null,
  category         varchar(100) not null default 'Divers',
  amount           numeric(12,2) not null check (amount > 0),
  receipt_url      text
);

-- ---------------------------------------------------------------------
-- 14. notifications / 15. audit_logs
-- ---------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade,
  store_id      uuid references public.stores(id) on delete cascade,
  target_roles  text[],
  type          text not null,
  severity      text not null default 'info' check (severity in ('info','warning','critical')),
  title         varchar(255) not null,
  message       text not null,
  created_at    timestamptz not null default now()
);
create index notifications_created_idx on public.notifications(created_at desc);

-- Lecture par utilisateur (une notification peut cibler plusieurs personnes)
create table public.notification_reads (
  notification_id  uuid not null references public.notifications(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  action      varchar(30) not null,
  entity      varchar(50) not null,
  entity_id   uuid,
  details     text,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- Stockage : images produits & justificatifs
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('expense-receipts', 'expense-receipts', false)
  on conflict (id) do nothing;
