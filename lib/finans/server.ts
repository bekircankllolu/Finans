import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_CATEGORIES } from './defaults'
import { getRates } from './fx'
import { addMonths, monthKey, todayISO } from './calc/dates'
import type { FinanceData, Transaction } from './types'

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

export interface FinanceUser {
  id: string
  email: string | null
}

// getClaims JWT'yi asimetrik anahtarla yerelde doğrular (Auth sunucusuna gitmez);
// proje eski simetrik anahtardaysa SDK kendisi getUser'a düşer.
export async function getFinanceUser(): Promise<{ supabase: SupabaseClient; user: FinanceUser }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) throw new FinanceAuthError(401)
  const user = { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
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
  if (!count) await seedDefaults(supabase, userId)
}

async function seedDefaults(supabase: SupabaseClient, userId: string) {
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

// Kolon bulunamadı (42703) / tablo yok (42P01): veritabanı migration'ı çalıştırılmamış demektir
export function schemaError(error: { message: string; code?: string }): Error {
  if (error.code === '42703' || error.code === '42P01') {
    return new Error(`Veritabanı güncel değil: Supabase SQL editor'de supabase/finans_v3.sql dosyasını çalıştır. (${error.message})`)
  }
  return new Error(error.message)
}

const TX_COLUMNS =
  'id, account_id, statement_id, date, description, merchant, amount, direction, currency, amount_try, category_id, installment_no, installment_total, source, notes, tx_type'
const PAGE = 1000

// Supabase (PostgREST) tek sorguda en fazla 1000 satır döner; işlemler sayfa sayfa okunur.
async function loadTransactions(supabase: SupabaseClient, since: string) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fin_transactions')
      .select(TX_COLUMNS)
      .gte('date', since)
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw schemaError(error)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export async function loadFinanceData(supabase: SupabaseClient, userId: string, monthsBack = 24): Promise<FinanceData> {
  const since = `${addMonths(monthKey(todayISO()), -monthsBack)}-01`
  const [accounts, categories, transactions, statements, loans, installments, incomes, holdings, budgets, goals, dismissed, fx] =
    await Promise.all([
      supabase.from('fin_accounts').select('*').order('created_at'),
      supabase.from('fin_categories').select('*').order('sort'),
      loadTransactions(supabase, since),
      supabase
        .from('fin_statements')
        .select('id, account_id, kind, file_name, mime_type, status, period_start, period_end, due_date, total_debt, min_payment, closing_balance, bank, previous_balance, reconcile_status, reconcile_diff, error, created_at, confirmed_at')
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

  for (const r of [accounts, categories, statements, loans, installments, incomes, holdings, budgets, goals]) {
    if (r.error) throw schemaError(r.error)
  }

  // İlk girişte kategoriler boşsa varsayılanları ekle (ayrı bir kontrol sorgusu atmadan)
  let categoryRows = categories.data ?? []
  if (categoryRows.length === 0) {
    await seedDefaults(supabase, userId)
    categoryRows = (await supabase.from('fin_categories').select('*').order('sort')).data ?? []
  }

  // PostgREST numeric alanları string dönebilir; hepsini number'a çeviriyoruz.
  return {
    accounts: (accounts.data ?? []).map(a => ({
      ...a,
      balance: Number(a.balance),
      credit_limit: num(a.credit_limit),
      monthly_rate: num(a.monthly_rate),
    })),
    categories: categoryRows,
    transactions: transactions.map(t => ({ ...t, amount: Number(t.amount), amount_try: Number(t.amount_try) }) as Transaction),
    statements: (statements.data ?? []).map(s => ({
      ...s,
      total_debt: num(s.total_debt),
      min_payment: num(s.min_payment),
      closing_balance: num(s.closing_balance),
      previous_balance: num(s.previous_balance),
      reconcile_diff: num(s.reconcile_diff),
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
