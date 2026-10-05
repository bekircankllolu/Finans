-- Finans performans migration'ı (bir kez çalıştırın; tekrar çalıştırmak zararsız)
-- 1) RLS: auth.uid() her satır için yeniden hesaplanmasın diye (select auth.uid()) kullanılır.
-- 2) Sık filtrelenen kolonlara indeks.

do $$
declare t text;
begin
  foreach t in array array[
    'fin_accounts', 'fin_categories', 'fin_statements', 'fin_transactions',
    'fin_merchant_rules', 'fin_loans', 'fin_loan_installments', 'fin_income_sources',
    'fin_holdings', 'fin_budgets', 'fin_goals', 'fin_reports', 'fin_alert_dismissals',
    'fin_chat_messages'
  ] loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

create index if not exists fin_accounts_user_idx on public.fin_accounts(user_id);
create index if not exists fin_statements_user_created_idx on public.fin_statements(user_id, created_at desc);
create index if not exists fin_statements_account_idx on public.fin_statements(account_id, period_end);
create index if not exists fin_transactions_statement_idx on public.fin_transactions(statement_id);
create index if not exists fin_transactions_merchant_idx on public.fin_transactions(user_id, merchant);
create index if not exists fin_loans_user_idx on public.fin_loans(user_id);
create index if not exists fin_loan_installments_user_idx on public.fin_loan_installments(user_id);
create index if not exists fin_income_sources_user_idx on public.fin_income_sources(user_id);
create index if not exists fin_holdings_user_idx on public.fin_holdings(user_id);
create index if not exists fin_goals_user_idx on public.fin_goals(user_id);
create index if not exists fin_chat_messages_user_created_idx on public.fin_chat_messages(user_id, created_at);

analyze public.fin_transactions;
