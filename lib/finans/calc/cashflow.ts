import type { Category, Transaction } from '../types'
import { monthKey } from './dates'

// Kredi taksiti ödemeleri bu kategoriye düşer; tahminde kredi planından ayrıca sayıldığı için
// ortalama harcamadan çıkarılır.
export const LOAN_PAYMENT_CATEGORY = 'Kredi Ödemesi'
export const UNCATEGORIZED = 'uncategorized'

export type CategoryMap = Map<string, Category>

export function categoryMap(categories: Category[]): CategoryMap {
  return new Map(categories.map(c => [c.id, c]))
}

// Kendi hesapları arası transferler (kart ödemesi, kredi kullanımı) gelir/gider sayılmaz
export function isTransfer(tx: Transaction, cats: CategoryMap): boolean {
  return tx.category_id ? cats.get(tx.category_id)?.kind === 'transfer' : false
}

export function isExpense(tx: Transaction, cats: CategoryMap): boolean {
  return tx.direction === 'out' && !isTransfer(tx, cats)
}

export function isIncome(tx: Transaction, cats: CategoryMap): boolean {
  return tx.direction === 'in' && !isTransfer(tx, cats)
}

// Karta yapılan iade/cashback gider kategorisine düşerse gideri azaltır
export function signedExpense(tx: Transaction, cats: CategoryMap): number {
  if (isTransfer(tx, cats)) return 0
  const cat = tx.category_id ? cats.get(tx.category_id) : undefined
  if (tx.direction === 'out') return tx.amount_try
  if (cat?.kind === 'expense') return -tx.amount_try
  return 0
}

export function signedIncome(tx: Transaction, cats: CategoryMap): number {
  if (isTransfer(tx, cats) || tx.direction !== 'in') return 0
  const cat = tx.category_id ? cats.get(tx.category_id) : undefined
  return cat?.kind === 'expense' ? 0 : tx.amount_try
}

export interface MonthSummary {
  month: string
  income: number
  expense: number
  net: number
  savingsRate: number | null
  fixedExpense: number
  byCategory: Record<string, number>
  txCount: number
}

export function summarizeMonths(txns: Transaction[], categories: Category[], months: string[]): MonthSummary[] {
  const cats = categoryMap(categories)
  const map = new Map<string, MonthSummary>(
    months.map(m => [m, { month: m, income: 0, expense: 0, net: 0, savingsRate: null, fixedExpense: 0, byCategory: {}, txCount: 0 }]),
  )

  for (const tx of txns) {
    const s = map.get(monthKey(tx.date))
    if (!s) continue
    s.txCount++
    const inc = signedIncome(tx, cats)
    const exp = signedExpense(tx, cats)
    s.income += inc
    if (exp !== 0) {
      s.expense += exp
      const key = tx.category_id ?? UNCATEGORIZED
      s.byCategory[key] = (s.byCategory[key] ?? 0) + exp
      if (tx.category_id && cats.get(tx.category_id)?.is_fixed) s.fixedExpense += exp
    }
  }

  return months.map(m => {
    const s = map.get(m)!
    s.net = s.income - s.expense
    s.savingsRate = s.income > 0 ? s.net / s.income : null
    return s
  })
}

export interface CategorySlice {
  categoryId: string
  name: string
  color: string
  amount: number
  share: number
  prevAmount: number
  avg3: number
}

export function categoryBreakdown(
  summary: MonthSummary,
  previous: MonthSummary[],
  categories: Category[],
): CategorySlice[] {
  const cats = categoryMap(categories)
  const total = summary.expense || 1
  const prev = previous.at(-1)
  const last3 = previous.slice(-3)
  return Object.entries(summary.byCategory)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const cat = cats.get(id)
      return {
        categoryId: id,
        name: cat?.name ?? 'Kategorisiz',
        color: cat?.color ?? '#5A5A6E',
        amount,
        share: amount / total,
        prevAmount: prev?.byCategory[id] ?? 0,
        avg3: last3.length ? last3.reduce((s, m) => s + (m.byCategory[id] ?? 0), 0) / last3.length : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

// Tahmin için "taban" aylık harcama: taksitli işlemler ve kredi ödemeleri hariç,
// çünkü onlar plan üzerinden ayrıca projekte edilir.
export function baseMonthlySpend(txns: Transaction[], categories: Category[], months: string[]): number {
  const cats = categoryMap(categories)
  const set = new Set(months)
  const totals = new Map<string, number>()
  for (const tx of txns) {
    const m = monthKey(tx.date)
    if (!set.has(m)) continue
    if ((tx.installment_total ?? 0) > 1) continue
    const cat = tx.category_id ? cats.get(tx.category_id) : undefined
    if (cat?.name === LOAN_PAYMENT_CATEGORY) continue
    totals.set(m, (totals.get(m) ?? 0) + signedExpense(tx, cats))
  }
  const withData = [...totals.values()].filter(v => v > 0)
  return withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0
}
