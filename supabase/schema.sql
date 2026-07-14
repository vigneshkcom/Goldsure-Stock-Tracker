create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.holders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  holder_type text not null check (holder_type in ('warehouse', 'technician', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.warranty_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_number text not null,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  status text not null default 'open' check (status in ('open', 'posted', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_number)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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

alter table public.stock_movements
add column if not exists product_condition text not null default 'good';

alter table public.stock_movements
add column if not exists warranty_job_id uuid references public.warranty_jobs(id) on delete set null;

alter table public.stock_movements
add column if not exists job_number text;

alter table public.stock_movements
add column if not exists customer_name text;

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

create index if not exists products_user_id_idx on public.products(user_id);
create index if not exists holders_user_id_idx on public.holders(user_id);
create index if not exists warranty_jobs_user_created_idx on public.warranty_jobs(user_id, created_at desc);
create index if not exists warranty_jobs_user_job_number_idx on public.warranty_jobs(user_id, job_number);
create index if not exists stock_movements_user_date_idx on public.stock_movements(user_id, movement_date desc);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);
create index if not exists stock_movements_warranty_job_idx on public.stock_movements(warranty_job_id);

alter table public.products enable row level security;
alter table public.holders enable row level security;
alter table public.warranty_jobs enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Users can read own products" on public.products;
drop policy if exists "Users can insert own products" on public.products;
drop policy if exists "Users can update own products" on public.products;
drop policy if exists "Users can delete own products" on public.products;

create policy "Users can read own products"
on public.products for select
using (auth.uid() = user_id);

create policy "Users can insert own products"
on public.products for insert
with check (auth.uid() = user_id);

create policy "Users can update own products"
on public.products for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own products"
on public.products for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own holders" on public.holders;
drop policy if exists "Users can insert own holders" on public.holders;
drop policy if exists "Users can update own holders" on public.holders;
drop policy if exists "Users can delete own holders" on public.holders;

create policy "Users can read own holders"
on public.holders for select
using (auth.uid() = user_id);

create policy "Users can insert own holders"
on public.holders for insert
with check (auth.uid() = user_id);

create policy "Users can update own holders"
on public.holders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own holders"
on public.holders for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can insert own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can update own warranty jobs" on public.warranty_jobs;
drop policy if exists "Users can delete own warranty jobs" on public.warranty_jobs;

create policy "Users can read own warranty jobs"
on public.warranty_jobs for select
using (auth.uid() = user_id);

create policy "Users can insert own warranty jobs"
on public.warranty_jobs for insert
with check (auth.uid() = user_id);

create policy "Users can update own warranty jobs"
on public.warranty_jobs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own warranty jobs"
on public.warranty_jobs for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own stock movements" on public.stock_movements;
drop policy if exists "Users can insert own stock movements" on public.stock_movements;
drop policy if exists "Users can update own stock movements" on public.stock_movements;
drop policy if exists "Users can delete own stock movements" on public.stock_movements;

create policy "Users can read own stock movements"
on public.stock_movements for select
using (auth.uid() = user_id);

create policy "Users can insert own stock movements"
on public.stock_movements for insert
with check (auth.uid() = user_id);

create policy "Users can update own stock movements"
on public.stock_movements for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own stock movements"
on public.stock_movements for delete
using (auth.uid() = user_id);
