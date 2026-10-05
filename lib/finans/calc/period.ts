import type { Account, Category, Statement, Transaction } from '../types'
import { categoryMap, signedExpense, signedIncome } from './cashflow'
import { addMonths, dateInMonth, monthKey } from './dates'

// Özet ekranının dönem mantığı:
//  - 'month': takvim ayı (1'i – ay sonu), tüm hesaplar için aynı
//  - 'card' : kredi kartları kendi hesap kesim dönemine göre (o ay kesilen ekstre), diğer hesaplar takvim ayı

export type PeriodMode = 'month' | 'card'

export interface PeriodSelection {
  month: string
  mode: PeriodMode
}

export interface AccountPeriod {
  start: string
  end: string
  statementId: string | null
}

function calendar(month: string): AccountPeriod {
  return { start: `${month}-01`, end: dateInMonth(month, 31), statementId: null }
}

export function accountPeriods(sel: PeriodSelection, accounts: Account[], statements: Statement[]): Map<string, AccountPeriod> {
  const map = new Map<string, AccountPeriod>()
  for (const a of accounts) {
    if (sel.mode === 'card' && a.type === 'credit_card') {
      // O ay içinde kesilmiş onaylı ekstre; yoksa kesim gününden türetilen aralık
      const st = statements.find(s => s.account_id === a.id && s.status === 'confirmed' && s.period_end && monthKey(s.period_end) === sel.month)
      if (st?.period_end) {
        const start = st.period_start ?? addDay(dateInMonth(addMonths(sel.month, -1), Number(st.period_end.slice(8, 10))))
        map.set(a.id, { start, end: st.period_end, statementId: st.id })
        continue
      }
      if (a.statement_day) {
        const end = dateInMonth(sel.month, a.statement_day)
        map.set(a.id, { start: addDay(dateInMonth(addMonths(sel.month, -1), a.statement_day)), end, statementId: null })
        continue
      }
    }
    map.set(a.id, calendar(sel.month))
  }
  return map
}

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function inPeriod(tx: Transaction, sel: PeriodSelection, periods: Map<string, AccountPeriod>): boolean {
  const p = (tx.account_id && periods.get(tx.account_id)) || calendar(sel.month)
  return tx.date >= p.start && tx.date <= p.end
}

export interface AccountBreakdown {
  account: Account
  period: AccountPeriod
  spend: number
  income: number
  count: number
  topCategories: { name: string; amount: number }[]
}

export interface MerchantTotal {
  merchant: string
  amount: number
  count: number
  category: string | null
}

export interface PeriodSummary {
  selection: PeriodSelection
  income: number
  expense: number
  net: number
  savingsRate: number | null
  txCount: number
  byCategory: { categoryId: string; name: string; amount: number; share: number }[]
  byAccount: AccountBreakdown[]
  unassignedSpend: number
  topMerchants: MerchantTotal[]
  biggest: Transaction[]
  split: { fixed: number; installments: number; bankCosts: number; variable: number }
}

const BANK_COST_TYPES = new Set(['interest', 'fee', 'tax'])

export function summarizePeriod(
  txns: Transaction[],
  categories: Category[],
  accounts: Account[],
  statements: Statement[],
  sel: PeriodSelection,
): PeriodSummary {
  const cats = categoryMap(categories)
  const periods = accountPeriods(sel, accounts, statements)
  const rows = txns.filter(t => inPeriod(t, sel, periods))

  let income = 0
  let expense = 0
  const byCat = new Map<string, number>()
  const byAcc = new Map<string, { spend: number; income: number; count: number; cats: Map<string, number> }>()
  const byMerchant = new Map<string, MerchantTotal>()
  const split = { fixed: 0, installments: 0, bankCosts: 0, variable: 0 }
  let unassignedSpend = 0

  for (const t of rows) {
    const inc = signedIncome(t, cats)
    const exp = signedExpense(t, cats)
    income += inc
    expense += exp
    const cat = t.category_id ? cats.get(t.category_id) : undefined

    if (exp !== 0) {
      const key = t.category_id ?? 'uncategorized'
      byCat.set(key, (byCat.get(key) ?? 0) + exp)
      const m = byMerchant.get(t.merchant) ?? { merchant: t.merchant, amount: 0, count: 0, category: cat?.name ?? null }
      m.amount += exp
      m.count++
      byMerchant.set(t.merchant, m)
      if ((t.installment_total ?? 0) > 1) split.installments += exp
      else if (t.tx_type && BANK_COST_TYPES.has(t.tx_type)) split.bankCosts += exp
      else if (cat?.is_fixed) split.fixed += exp
      else split.variable += exp
    }

    if (t.account_id) {
      const a = byAcc.get(t.account_id) ?? { spend: 0, income: 0, count: 0, cats: new Map() }
      a.count++
      a.spend += exp
      a.income += inc
      if (exp !== 0) a.cats.set(cat?.name ?? 'Kategorisiz', (a.cats.get(cat?.name ?? 'Kategorisiz') ?? 0) + exp)
      byAcc.set(t.account_id, a)
    } else if (exp !== 0) {
      unassignedSpend += exp
    }
  }

  const total = expense || 1
  const byCategory = [...byCat]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ categoryId: id, name: cats.get(id)?.name ?? 'Kategorisiz', amount, share: amount / total }))
    .sort((a, b) => b.amount - a.amount)

  const byAccount: AccountBreakdown[] = accounts
    .filter(a => a.is_active || byAcc.has(a.id))
    .map(a => {
      const v = byAcc.get(a.id)
      return {
        account: a,
        period: periods.get(a.id) ?? calendar(sel.month),
        spend: v?.spend ?? 0,
        income: v?.income ?? 0,
        count: v?.count ?? 0,
        topCategories: [...(v?.cats ?? new Map<string, number>())]
          .filter(([, amount]) => amount > 0)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([name, amount]) => ({ name, amount })),
      }
    })
    .sort((a, b) => b.spend - a.spend || b.count - a.count)

  const biggest = rows
    .filter(t => signedExpense(t, cats) > 0)
    .sort((a, b) => b.amount_try - a.amount_try)
    .slice(0, 6)

  return {
    selection: sel,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    txCount: rows.length,
    byCategory,
    byAccount,
    unassignedSpend,
    topMerchants: [...byMerchant.values()].filter(m => m.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 10),
    biggest,
    split,
  }
}

// Verisi olan aylar (yeniden eskiye) — dönem seçicinin sınırları
export function monthsWithData(txns: Transaction[]): string[] {
  return [...new Set(txns.map(t => monthKey(t.date)))].sort().reverse()
}
