-- Finans v3: doğrulamalı ekstre okuma, öğrenen banka kuralları, çok sayfalı ekstre.
-- Supabase SQL editor'de bir kez çalıştırın (tekrar çalıştırmak zararsız).

alter table public.fin_statements add column if not exists bank text;
alter table public.fin_statements add column if not exists extra_paths text[] not null default '{}';
alter table public.fin_statements add column if not exists previous_balance numeric(14,2);
alter table public.fin_statements add column if not exists opening_balance numeric(14,2);
alter table public.fin_statements add column if not exists reconcile_status text check (reconcile_status in ('ok', 'mismatch', 'unknown'));
alter table public.fin_statements add column if not exists reconcile_diff numeric(14,2);

alter table public.fin_transactions add column if not exists tx_type text;

-- Kullanıcının onay ekranındaki düzeltmelerinden öğrenilen banka bazlı kurallar
create table if not exists public.fin_bank_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank text not null,
  pattern text not null,
  kind text not null check (kind in ('direction', 'exclude')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, bank, kind, pattern)
);

alter table public.fin_bank_rules enable row level security;
drop policy if exists "owner_all" on public.fin_bank_rules;
create policy "owner_all" on public.fin_bank_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists fin_bank_rules_user_bank_idx on public.fin_bank_rules(user_id, bank);
