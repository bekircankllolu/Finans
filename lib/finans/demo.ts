import type { SupabaseClient } from '@supabase/supabase-js'
import type { FinanceUser } from './server'
import { DEFAULT_CATEGORIES } from './defaults'
import { addMonths, dateInMonth, monthKey, todayISO } from './calc/dates'
import { buildSchedule } from './calc/loans'
import type { Category, FinanceData, Transaction } from './types'
import type { ParsedStatement } from './ai/schemas'
import { buildDraft } from './statementPipeline'

// Sadece geliştirmede: FINANS_DEMO=1 ile Supabase olmadan arayüzü örnek veriyle açar.
export function isDemoMode(): boolean {
  return process.env.FINANS_DEMO === '1' && process.env.NODE_ENV !== 'production'
}

export const DEMO_USER: FinanceUser = { id: '00000000-0000-4000-8000-000000000000', email: 'demo@example.com' }

// Tablo bazında örnek satır dönen zincirlenebilir sahte istemci (sadece okuma; yazmalar etkisiz)
export function demoSupabase(): SupabaseClient {
  const make = (table: string | null, single: boolean): unknown =>
    new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === 'then') {
          const rows = table === 'fin_statements' ? [demoReviewStatement()] : []
          return (resolve: (v: unknown) => void) => resolve({ data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length })
        }
        if (prop === 'from') return (t: string) => make(t, false)
        if (prop === 'single' || prop === 'maybeSingle') return () => make(table, true)
        return make(table, single)
      },
      apply: () => make(table, single),
    })
  return make(null, false) as SupabaseClient
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function demoData(): FinanceData {
  const today = todayISO()
  const current = monthKey(today)
  const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: uuid(100 + i),
    name: c.name,
    kind: c.kind,
    color: '#8B8B9E',
    is_fixed: c.is_fixed ?? false,
    sort: i,
  }))
  const cat = (name: string) => categories.find(c => c.name === name)!.id

  const card1 = uuid(1)
  const card2 = uuid(2)
  const checking = uuid(3)
  let seq = 1000
  // Deterministik sahte rastgelelik
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const txns: Transaction[] = []
  const tx = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'merchant' | 'amount' | 'direction'>) => {
    if (p.date > today) return
    txns.push({
      id: uuid(seq++),
      account_id: card1,
      statement_id: null,
      description: p.merchant,
      currency: 'TRY',
      amount_try: p.amount,
      category_id: null,
      installment_no: null,
      installment_total: null,
      source: 'statement',
      notes: null,
      tx_type: null,
      ...p,
    })
  }

  for (let i = -11; i <= 0; i++) {
    const m = addMonths(current, i)
    const bump = i === -1 ? 1.6 : 1
    tx({ date: dateInMonth(m, 1), merchant: 'MAAŞ ÖDEMESİ', amount: 92_000, direction: 'in', account_id: checking, category_id: cat('Maaş') })
    if (i % 2 === 0) tx({ date: dateInMonth(m, 18), merchant: 'FREELANCE PROJE', amount: 25_000 + Math.round(rnd() * 15_000), direction: 'in', account_id: checking, category_id: cat('Freelance') })
    tx({ date: dateInMonth(m, 3), merchant: 'KİRA ÖDEMESİ', amount: 28_000, direction: 'out', account_id: checking, category_id: cat('Kira & Aidat') })
    tx({ date: dateInMonth(m, 6), merchant: 'ENERJISA', amount: 1_400 + Math.round(rnd() * 900), direction: 'out', account_id: checking, category_id: cat('Faturalar') })
    tx({ date: dateInMonth(m, 7), merchant: 'TURKCELL', amount: 650, direction: 'out', category_id: cat('Faturalar') })
    tx({ date: dateInMonth(m, 9), merchant: 'NETFLIX.COM', amount: 230, direction: 'out', category_id: cat('Abonelikler') })
    tx({ date: dateInMonth(m, 9), merchant: 'SPOTIFY', amount: 100, direction: 'out', category_id: cat('Abonelikler') })
    tx({ date: dateInMonth(m, 12), merchant: 'ADOBE CREATIVE CLOUD', amount: 1_150, direction: 'out', category_id: cat('Abonelikler') })
    for (let w = 0; w < 4; w++) {
      tx({ date: dateInMonth(m, 4 + w * 7), merchant: w % 2 ? 'MIGROS' : 'A101', amount: Math.round((1_800 + rnd() * 1_400) * bump), direction: 'out', account_id: w % 2 ? card1 : card2, category_id: cat('Market') })
      tx({ date: dateInMonth(m, 5 + w * 7), merchant: ['KAHVE DÜNYASI', 'YEMEKSEPETI', 'BURGER KING', 'GETIR'][w], amount: Math.round((450 + rnd() * 900) * bump), direction: 'out', category_id: cat('Yeme-İçme') })
    }
    tx({ date: dateInMonth(m, 14), merchant: 'SHELL', amount: 2_400 + Math.round(rnd() * 800), direction: 'out', account_id: card2, category_id: cat('Ulaşım & Akaryakıt') })
    tx({ date: dateInMonth(m, 20), merchant: 'TRENDYOL', amount: Math.round(900 + rnd() * 2_500), direction: 'out', category_id: cat('Online Alışveriş') })
    if (i === -1) tx({ date: dateInMonth(m, 22), merchant: 'PEGASUS', amount: 9_800, direction: 'out', category_id: cat('Seyahat') })
    tx({ date: dateInMonth(m, 25), merchant: 'HESAPTAN KART ÖDEMESİ', amount: 30_000, direction: 'in', category_id: cat('Transfer / Kart Ödemesi') })
    tx({ date: dateInMonth(m, 25), merchant: 'KART ÖDEMESİ', amount: 30_000, direction: 'out', account_id: checking, category_id: cat('Transfer / Kart Ödemesi') })
    tx({ date: dateInMonth(m, 15), merchant: 'İHTİYAÇ KREDİSİ TAKSİT', amount: 10_827, direction: 'out', account_id: checking, category_id: cat('Kredi Ödemesi') })
  }
  // Taksitli alışverişler: 9 taksitli laptop, 6 taksitli koltuk
  for (let k = 1; k <= 9; k++) {
    tx({ date: dateInMonth(addMonths(current, k - 6), 10), merchant: 'MEDIAMARKT', amount: 7_500, direction: 'out', installment_no: k, installment_total: 9, category_id: cat('Teknoloji & Elektronik') })
  }
  for (let k = 1; k <= 6; k++) {
    tx({ date: dateInMonth(addMonths(current, k - 4), 11), merchant: 'IKEA', amount: 3_200, direction: 'out', account_id: card2, installment_no: k, installment_total: 6, category_id: cat('Ev & Yaşam') })
  }
  // Kategorisiz bir işlem
  tx({ date: dateInMonth(addMonths(current, -1), 27), merchant: 'POS 4471 ANTALYA', amount: 1_250, direction: 'out' })

  const loanId = uuid(50)
  const firstDue = dateInMonth(addMonths(current, -5), 15)
  const installments = buildSchedule({ principal: 100_000, monthlyRatePct: 3.29, termMonths: 12, firstDueDate: firstDue, includeTaxes: true }, today).map(
    (r, i) => ({ ...r, id: uuid(600 + i), loan_id: loanId }),
  )

  const dueSoon = dateInMonth(monthKey(today), Math.min(28, Number(today.slice(8, 10)) + 3))

  return {
    accounts: [
      { id: card1, type: 'credit_card', bank: 'Garanti BBVA', name: 'Bonus Platinum', currency: 'TRY', last4: '4821', credit_limit: 120_000, balance: 41_300, balance_updated_at: today, statement_day: 20, due_day: Number(dueSoon.slice(8, 10)), monthly_rate: 4.25, is_active: true },
      { id: card2, type: 'credit_card', bank: 'Yapı Kredi', name: 'World Card', currency: 'TRY', last4: '1907', credit_limit: 45_000, balance: 38_900, balance_updated_at: today, statement_day: 5, due_day: 15, monthly_rate: 4.25, is_active: true },
      { id: checking, type: 'checking', bank: 'Enpara', name: 'Maaş Hesabı', currency: 'TRY', last4: null, credit_limit: null, balance: 36_500, balance_updated_at: today, statement_day: null, due_day: null, monthly_rate: null, is_active: true },
    ],
    categories,
    transactions: txns.sort((a, b) => b.date.localeCompare(a.date)),
    statements: [
      { id: uuid(70), account_id: card1, kind: 'bank_statement', file_name: 'garanti-bonus-ekstre.pdf', mime_type: 'application/pdf', status: 'confirmed', period_start: null, period_end: dateInMonth(addMonths(current, -1), 20), due_date: dueSoon, total_debt: 41_300, min_payment: 8_260, closing_balance: null, bank: 'Garanti BBVA', previous_balance: 30_000, reconcile_status: 'ok', reconcile_diff: 0, error: null, created_at: today, confirmed_at: today },
      { id: uuid(71), account_id: card2, kind: 'bank_statement', file_name: 'ykb-world.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'parsed', period_start: null, period_end: null, due_date: null, total_debt: null, min_payment: null, closing_balance: null, bank: 'Yapı Kredi', previous_balance: null, reconcile_status: null, reconcile_diff: null, error: null, created_at: today, confirmed_at: null },
    ],
    loans: [{ id: loanId, name: 'İhtiyaç Kredisi', bank: 'Akbank', principal: 100_000, monthly_rate: 3.29, term_months: 12, first_due_date: firstDue, include_taxes: true }],
    installments,
    incomes: [
      { id: uuid(80), name: 'Maaş', kind: 'salary', amount: 92_000, currency: 'TRY', day_of_month: 1, is_recurring: true, is_active: true },
      { id: uuid(81), name: 'Freelance', kind: 'freelance', amount: 20_000, currency: 'TRY', day_of_month: null, is_recurring: false, is_active: true },
    ],
    holdings: [
      { id: uuid(90), name: 'Gram altın', asset: 'XAU', quantity: 25, unit_price_try: null, updated_at: today },
      { id: uuid(91), name: 'Dolar birikimi', asset: 'USD', quantity: 1_500, unit_price_try: null, updated_at: today },
    ],
    budgets: [
      { id: uuid(95), category_id: cat('Yeme-İçme'), monthly_limit: 5_000 },
      { id: uuid(96), category_id: cat('Market'), monthly_limit: 9_000 },
    ],
    goals: [{ id: uuid(97), name: 'Acil durum fonu', target_amount: 250_000, current_amount: 60_000, target_date: dateInMonth(addMonths(current, 12), 1) }],
    fx: { USD: 41.5, EUR: 48.6, GBP: 55.9, XAU: 4_350 },
    dismissed: [],
  }
}

// Onay ekranı önizlemesi için: toplamı tutmayan (bir satırı eksik okunmuş) örnek kart ekstresi
export function demoReviewStatement() {
  const current = monthKey(todayISO())
  const prevM = addMonths(current, -1)
  const d = (m: string, day: number) => dateInMonth(m, day)
  const t = (p: Partial<ParsedStatement['transactions'][number]> & Pick<ParsedStatement['transactions'][number], 'date' | 'description' | 'amount' | 'direction' | 'type' | 'category'>) => ({
    merchant: p.description,
    currency: 'TRY',
    original_amount: null,
    original_currency: null,
    installment_no: null,
    installment_total: null,
    confidence: 'high' as const,
    page: 1,
    ...p,
  })
  const raw: ParsedStatement = {
    document_kind: 'credit_card_statement',
    bank: null,
    card_brand: 'World Card',
    account_type: 'credit_card',
    account_name: 'Yapı Kredi World',
    last4: '1907',
    currency: 'TRY',
    period_start: d(prevM, 6),
    period_end: d(current, 5),
    due_date: d(current, 15),
    previous_balance: 20_000,
    total_debt: 24_150,
    min_payment: 4_830,
    credit_limit: 45_000,
    opening_balance: null,
    closing_balance: null,
    payments_total: null,
    purchases_total: null,
    warnings: [],
    transactions: [
      t({ date: d(prevM, 10), description: 'ODEME-TESEKKUR EDERIZ', amount: 20_000, direction: 'in', type: 'payment', category: 'Transfer / Kart Ödemesi' }),
      t({ date: d(prevM, 12), description: 'A101 ALANYA', merchant: 'A101', amount: 3_000, direction: 'out', type: 'purchase', category: 'Market' }),
      t({ date: d(prevM, 20), description: 'IKEA 2/6', merchant: 'IKEA', amount: 3_200, direction: 'out', type: 'installment', installment_no: 2, installment_total: 6, category: 'Ev & Yaşam' }),
      t({ date: d(prevM, 21), description: 'WORLDPUAN KAZANIM', merchant: 'WORLDPUAN', amount: 300, direction: 'in', type: 'other_in', category: 'Diğer Gelir', confidence: 'low', page: 2 }),
      t({ date: d(prevM, 25), description: 'NETFLIX.COM AMSTERDAM', merchant: 'NETFLIX', amount: 229.99, direction: 'out', type: 'fx_purchase', original_amount: 5.49, original_currency: 'USD', category: 'Eğlence & Hobi' }),
      t({ date: d(current, 1), description: 'PEGASUS HAVA YOLLARI', merchant: 'PEGASUS', amount: 16_570.01, direction: 'out', type: 'purchase', category: 'Seyahat', page: 2 }),
    ],
  }
  const data = demoData()
  const draft = buildDraft(raw, { categories: data.categories, userRules: [], bankRules: [], hasLoans: true })
  return {
    id: uuid(71),
    account_id: uuid(2),
    kind: 'bank_statement',
    file_name: 'ykb-world-ekstre.pdf',
    file_path: 'demo/ykb.pdf',
    extra_paths: [],
    mime_type: 'application/pdf',
    status: 'parsed',
    parsed: { raw, draft },
    error: null,
  }
}
