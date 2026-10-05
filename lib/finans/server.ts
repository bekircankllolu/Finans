import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_CATEGORIES } from './defaults'
import { getRates } from './fx'
import { addMonths, monthKey, todayISO } from './calc/dates'
import type { FinanceData } from './types'

// FINANS_ALLOWED_EMAIL boşsa giriş yapmış herkes erişir; doluysa sadece listedekiler.
export function isAllowedEmail(email: string | undefined | null): boolean {
  const allow = (process.env.FINANS_ALLOWED_EMAIL ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  if (allow.length === 0) return true
  return !!email && allow.includes(email.toLowerCase())
}

export class FinanceAuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? 'Giriş gerekli' : 'Bu hesabın finans modülüne erişimi yok')
  }
}

export async function getFinanceUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new FinanceAuthError(401)
  if (!isAllowedEmail(user.email)) throw new FinanceAuthError(403)
  return { supabase, user }
}

// Route handler'larda ortak hata cevabı
export function errorResponse(err: unknown): Response {
  if (err instanceof FinanceAuthError) return Response.json({ error: err.message }, { status: err.status })
  console.error('[finans]', err)
  const message = err instanceof Error ? err.message : 'Beklenmeyen hata'
  return Response.json({ error: message }, { status: 500 })
}

export async function ensureDefaults(supabase: SupabaseClient, userId: string) {
  const { count } = await supabase.from('fin_categories').select('id', { count: 'exact', head: true })
  if (count && count > 0) return
  await supabase.from('fin_categories').upsert(
    DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: userId,
      name: c.name,
      kind: c.kind,
      is_fixed: c.is_fixed ?? false,
      sort: i,
    })),
    { onConflict: 'user_id,name', ignoreDuplicates: true },
  )
}

const num = (v: unknown) => (v == null ? null : Number(v))

export async function loadFinanceData(supabase: SupabaseClient, monthsBack = 24): Promise<FinanceData> {
  const since = `${addMonths(monthKey(todayISO()), -monthsBack)}-01`
  const [accounts, categories, transactions, statements, loans, installments, incomes, holdings, budgets, goals, dismissed, fx] =
    await Promise.all([
      supabase.from('fin_accounts').select('*').order('created_at'),
      supabase.from('fin_categories').select('*').order('sort'),
      supabase.from('fin_transactions').select('*').gte('date', since).order('date', { ascending: false }).limit(20000),
      supabase
        .from('fin_statements')
        .select('id, account_id, kind, file_name, mime_type, status, period_start, period_end, due_date, total_debt, min_payment, closing_balance, error, created_at, confirmed_at')
        .order('created_at', { ascending: false }),
      supabase.from('fin_loans').select('*').order('created_at'),
      supabase.from('fin_loan_installments').select('*').order('no'),
      supabase.from('fin_income_sources').select('*').order('created_at'),
      supabase.from('fin_holdings').select('*').order('updated_at'),
      supabase.from('fin_budgets').select('*'),
      supabase.from('fin_goals').select('*').order('created_at'),
      supabase.from('fin_alert_dismissals').select('key'),
      getRates(supabase),
    ])

  for (const r of [accounts, categories, transactions, statements, loans, installments, incomes, holdings, budgets, goals]) {
    if (r.error) throw new Error(r.error.message)
  }

  // PostgREST numeric alanları string dönebilir; hepsini number'a çeviriyoruz.
  return {
    accounts: (accounts.data ?? []).map(a => ({
      ...a,
      balance: Number(a.balance),
      credit_limit: num(a.credit_limit),
      monthly_rate: num(a.monthly_rate),
    })),
    categories: categories.data ?? [],
    transactions: (transactions.data ?? []).map(t => ({ ...t, amount: Number(t.amount), amount_try: Number(t.amount_try) })),
    statements: (statements.data ?? []).map(s => ({
      ...s,
      total_debt: num(s.total_debt),
      min_payment: num(s.min_payment),
      closing_balance: num(s.closing_balance),
    })),
    loans: (loans.data ?? []).map(l => ({ ...l, principal: Number(l.principal), monthly_rate: Number(l.monthly_rate) })),
    installments: (installments.data ?? []).map(i => ({
      ...i,
      principal: Number(i.principal),
      interest: Number(i.interest),
      tax: Number(i.tax),
      total: Number(i.total),
      remaining_principal: Number(i.remaining_principal),
    })),
    incomes: (incomes.data ?? []).map(i => ({ ...i, amount: Number(i.amount) })),
    holdings: (holdings.data ?? []).map(h => ({ ...h, quantity: Number(h.quantity), unit_price_try: num(h.unit_price_try) })),
    budgets: (budgets.data ?? []).map(b => ({ ...b, monthly_limit: Number(b.monthly_limit) })),
    goals: (goals.data ?? []).map(g => ({ ...g, target_amount: Number(g.target_amount), current_amount: Number(g.current_amount) })),
    fx: fx.rates,
    dismissed: (dismissed.data ?? []).map(d => d.key),
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
