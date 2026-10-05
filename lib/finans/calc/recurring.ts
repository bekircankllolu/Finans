import type { Category, Transaction } from '../types'
import { categoryMap, isExpense, LOAN_PAYMENT_CATEGORY } from './cashflow'
import { monthKey } from './dates'

export interface RecurringPayment {
  merchant: string
  avgAmount: number
  months: number
  lastDate: string
  categoryId: string | null
  yearlyCost: number
}

// En az 3 farklı ayda, tutarı birbirine yakın (değişim katsayısı < %20) tekrarlayan giderler:
// abonelikler, faturalar, kira vb.
export function detectRecurring(txns: Transaction[], categories: Category[], sinceMonth: string): RecurringPayment[] {
  const cats = categoryMap(categories)
  const groups = new Map<string, Transaction[]>()
  for (const tx of txns) {
    if (monthKey(tx.date) < sinceMonth || !isExpense(tx, cats)) continue
    if ((tx.installment_total ?? 0) > 1) continue
    if (tx.category_id && cats.get(tx.category_id)?.name === LOAN_PAYMENT_CATEGORY) continue
    const list = groups.get(tx.merchant) ?? []
    list.push(tx)
    groups.set(tx.merchant, list)
  }

  const result: RecurringPayment[] = []
  for (const [merchant, list] of groups) {
    const byMonth = new Map<string, number>()
    for (const tx of list) byMonth.set(monthKey(tx.date), (byMonth.get(monthKey(tx.date)) ?? 0) + tx.amount_try)
    if (byMonth.size < 3) continue
    const amounts = [...byMonth.values()]
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const sd = Math.sqrt(amounts.reduce((s, a) => s + (a - avg) ** 2, 0) / amounts.length)
    if (avg <= 0 || sd / avg > 0.2) continue
    const last = list.reduce((a, b) => (a.date > b.date ? a : b))
    result.push({
      merchant,
      avgAmount: avg,
      months: byMonth.size,
      lastDate: last.date,
      categoryId: last.category_id,
      yearlyCost: avg * 12,
    })
  }
  return result.sort((a, b) => b.avgAmount - a.avgAmount)
}
