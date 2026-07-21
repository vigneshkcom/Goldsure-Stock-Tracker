create extension if not exists pgcrypto;

-- Shared, no-login workspace.
-- Every browser that opens the app reads and writes the same rows, so this
-- database is meant for a single internal team with a private Supabase project.
-- There are no user accounts: the anon key (used by the site) can read and
-- write everything.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  sku text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.holders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  holder_type text not null check (holder_type in ('warehouse', 'technician', 'other')),
  active boolean not null default true,
  phone text,
  address text,
  email text,
  created_at timestamptz not null default now()
);

-- Contact details for electricians (safe to run repeatedly).
alter table public.holders add column if not exists phone text;
alter table public.holders add column if not exists address text;
alter table public.holders add column if not exists email text;

create table if not exists public.warranty_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  job_number text not null,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  status text not null default 'open' check (status in ('open', 'posted', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Warranty vs one-off-post classification for jobs (safe to run repeatedly).
alter table public.warranty_jobs add column if not exists job_type text not null default 'warranty';

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  movement_date date not null default current_date,
  movement_type text not null check (
    movement_type in ('opening', 'receive', 'issue', 'return', 'install', 'customer_post', 'faulty_collect', 'adjustment')
  ),
  product_condition text not null default 'good' check (product_condition in ('good', 'faulty')),
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  from_holder_id uuid references public.holders(id) on delete restrict,
  to_holder_id uuid references public.holders(id) on delete restrict,
  warranty_job_id uuid references public.warranty_jobs(id) on delete set null,
  job_number text,
  customer_name text,
  reference text,
  tracking text,
  notes text,
  created_at timestamptz not null default now(),
  check (from_holder_id is not null or to_holder_id is not null)
);

-- Migrate an older auth-scoped database to the shared model.
-- Drop the account requirement and the foreign keys to auth.users so rows can
-- exist without a signed-in user.
alter table public.products alter column user_id drop not null;
alter table public.holders alter column user_id drop not null;
alter table public.warranty_jobs alter column user_id drop not null;
alter table public.stock_movements alter column user_id drop not null;

alter table public.products drop constraint if exists products_user_id_fkey;
alter table public.holders drop constraint if exists holders_user_id_fkey;
alter table public.warranty_jobs drop constraint if exists warranty_jobs_user_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_user_id_fkey;

-- Old per-account unique keys are replaced by workspace-wide ones.
alter table public.products drop constraint if exists products_user_id_name_key;
alter table public.holders drop constraint if exists holders_user_id_name_key;
alter table public.warranty_jobs drop constraint if exists warranty_jobs_user_id_job_number_key;

-- Extra columns for warranty tracking (safe to run repeatedly).
alter table public.stock_movements
add column if not exists product_condition text not null default 'good';

alter table public.stock_movements
add column if not exists warranty_job_id uuid references public.warranty_jobs(id) on delete set null;

alter table public.stock_movements
add column if not exists job_number text;

alter table public.stock_movements
add column if not exists customer_name text;

-- Stock-loss tracking: mark a movement as a loss and whether the holder was charged.
alter table public.stock_movements add column if not exists is_loss boolean not null default false;
alter table public.stock_movements add column if not exists charged boolean;
alter table public.stock_movements add column if not exists charge_amount numeric;

alter table public.stock_movements
drop constraint if exists stock_movements_movement_type_check;

alter table public.stock_movements
add constraint stock_movements_movement_type_check
check (movement_type in ('opening', 'receive', 'issue', 'return', 'install', 'customer_post', 'faulty_collect', 'adjustment'));

alter table public.stock_movements
drop constraint if exists stock_movements_product_condition_check;

alter table public.stock_movements
add constraint stock_movements_product_condition_check
check (product_condition in ('good', 'faulty'));

create index if not exists warranty_jobs_created_idx on public.warranty_jobs(created_at desc);
create index if not exists stock_movements_date_idx on public.stock_movements(movement_date desc);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);
create index if not exists stock_movements_warranty_job_idx on public.stock_movements(warranty_job_id);

alter table public.products enable row level security;
alter table public.holders enable row level security;
alter table public.warranty_jobs enable row level security;
alter table public.stock_movements enable row level security;

-- Remove the old account-scoped policies.
drop policy if exists "Users can read own products" on public.products;
drop policy if exists "Users can insert own products" on public.products;
drop policy if exists "Users can update own products" on public.products;
drop policy if exists "Users can delete own products" on public.products;
drop policy if exists "Users can read own holders" on public.holders;
drop policy if exists "Users can insert own holders" on public.holders;
drop policy if exists "Users can update own holders" on public.holders;
drop policy if exists "Users can delete own holders" on public.holders;
drop policy if exists "Users can read own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can insert own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can update own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can delete own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can read own stock movements" on public.stock_movements;
drop policy if exists "Users can insert own stock movements" on public.stock_movements;
drop policy if exists "Users can update own stock movements" on public.stock_movements;
drop policy if exists "Users can delete own stock movements" on public.stock_movements;

-- Shared workspace: anyone using the site's anon key has full access.
drop policy if exists "Shared access to products" on public.products;
drop policy if exists "Shared access to holders" on public.holders;
drop policy if exists "Shared access to warranty jobs" on public.warranty_jobs;
drop policy if exists "Shared access to stock movements" on public.stock_movements;

create policy "Shared access to products"
on public.products for all
using (true) with check (true);

create policy "Shared access to holders"
on public.holders for all
using (true) with check (true);

create policy "Shared access to warranty jobs"
on public.warranty_jobs for all
using (true) with check (true);

create policy "Shared access to stock movements"
on public.stock_movements for all
using (true) with check (true);
