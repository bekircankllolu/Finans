-- Kişisel Finans modülü şeması
-- Supabase SQL editor'de schema.sql'den sonra çalıştırın.
-- Tüm tablolar fin_ prefix'li ve RLS ile sadece sahibine açık.

create extension if not exists "pgcrypto";

-- ─── Hesaplar ────────────────────────────────────────────────
create table if not exists public.fin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('credit_card', 'checking', 'kmh', 'savings', 'investment', 'cash')),
  bank text,
  name text not null,
  currency text not null default 'TRY',
  last4 text,
  credit_limit numeric(14,2),
  -- checking/savings/cash: eldeki bakiye. credit_card/kmh: güncel borç (pozitif).
  balance numeric(14,2) not null default 0,
  balance_updated_at timestamptz,
  statement_day int check (statement_day between 1 and 31),
  due_day int check (due_day between 1 and 31),
  -- Aylık akdi faiz (%), kart/KMH için
  monthly_rate numeric(6,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Kategoriler ─────────────────────────────────────────────
create table if not exists public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  color text not null default '#8B8B9E',
  is_fixed boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ─── Ekstreler ───────────────────────────────────────────────
create table if not exists public.fin_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.fin_accounts(id) on delete set null,
  kind text not null default 'bank_statement' check (kind in ('bank_statement', 'loan_schedule')),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsing', 'parsed', 'confirmed', 'failed')),
  period_start date,
  period_end date,
  due_date date,
  total_debt numeric(14,2),
  min_payment numeric(14,2),
  closing_balance numeric(14,2),
  -- AI çıktısı (onay öncesi taslak)
  parsed jsonb,
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- ─── İşlemler ────────────────────────────────────────────────
create table if not exists public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.fin_accounts(id) on delete set null,
  statement_id uuid references public.fin_statements(id) on delete set null,
  date date not null,
  description text not null,
  merchant text not null,
  amount numeric(14,2) not null check (amount >= 0),
  direction text not null check (direction in ('in', 'out')),
  currency text not null default 'TRY',
  amount_try numeric(14,2) not null,
  category_id uuid references public.fin_categories(id) on delete set null,
  installment_no int,
  installment_total int,
  source text not null default 'statement' check (source in ('statement', 'manual')),
  notes text,
  dedupe_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_hash)
);

create index if not exists fin_transactions_user_date_idx on public.fin_transactions(user_id, date desc);
create index if not exists fin_transactions_category_idx on public.fin_transactions(category_id);

-- ─── Öğrenilen kategori kuralları ────────────────────────────
create table if not exists public.fin_merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null,
  category_id uuid not null references public.fin_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

-- ─── Krediler ────────────────────────────────────────────────
create table if not exists public.fin_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  principal numeric(14,2) not null,
  monthly_rate numeric(6,3) not null,
  term_months int not null check (term_months > 0),
  first_due_date date not null,
  include_taxes boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_loan_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id uuid not null references public.fin_loans(id) on delete cascade,
  no int not null,
  due_date date not null,
  principal numeric(14,2) not null,
  interest numeric(14,2) not null,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  remaining_principal numeric(14,2) not null,
  paid boolean not null default false,
  unique (loan_id, no)
);

-- ─── Gelir kaynakları ────────────────────────────────────────
create table if not exists public.fin_income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('salary', 'freelance', 'rent', 'other')),
  amount numeric(14,2) not null,
  currency text not null default 'TRY',
  day_of_month int check (day_of_month between 1 and 31),
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Varlıklar (döviz, altın, fon, BES) ──────────────────────
create table if not exists public.fin_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  asset text not null check (asset in ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'FUND', 'BES', 'STOCK', 'OTHER')),
  quantity numeric(18,4) not null,
  -- FUND/BES/STOCK/OTHER için elle girilen birim TL değeri
  unit_price_try numeric(14,4),
  updated_at timestamptz not null default now()
);

-- Kur cache'i (kullanıcıdan bağımsız)
create table if not exists public.fin_fx_rates (
  code text primary key,
  rate_try numeric(14,4) not null,
  updated_at timestamptz not null default now()
);

-- ─── Bütçe & hedefler ────────────────────────────────────────
create table if not exists public.fin_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.fin_categories(id) on delete cascade,
  monthly_limit numeric(14,2) not null check (monthly_limit > 0),
  unique (user_id, category_id)
);

create table if not exists public.fin_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

-- ─── AI raporları, uyarı kapatma, sohbet ─────────────────────
create table if not exists public.fin_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null,
  content text not null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.fin_alert_dismissals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.fin_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ─── RLS ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'fin_accounts', 'fin_categories', 'fin_statements', 'fin_transactions',
    'fin_merchant_rules', 'fin_loans', 'fin_loan_installments', 'fin_income_sources',
    'fin_holdings', 'fin_budgets', 'fin_goals', 'fin_reports', 'fin_alert_dismissals',
    'fin_chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

alter table public.fin_fx_rates enable row level security;
drop policy if exists "fx_read" on public.fin_fx_rates;
create policy "fx_read" on public.fin_fx_rates for select to authenticated using (true);
drop policy if exists "fx_write" on public.fin_fx_rates;
create policy "fx_write" on public.fin_fx_rates for insert to authenticated with check (true);
drop policy if exists "fx_update" on public.fin_fx_rates;
create policy "fx_update" on public.fin_fx_rates for update to authenticated using (true);

-- ─── Storage: ekstre dosyaları (private) ─────────────────────
insert into storage.buckets (id, name, public)
values ('fin-statements', 'fin-statements', false)
on conflict (id) do nothing;

drop policy if exists "fin_statements_owner_select" on storage.objects;
create policy "fin_statements_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'fin-statements' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fin_statements_owner_insert" on storage.objects;
create policy "fin_statements_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-statements' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fin_statements_owner_delete" on storage.objects;
create policy "fin_statements_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fin-statements' and (storage.foldername(name))[1] = auth.uid()::text);
