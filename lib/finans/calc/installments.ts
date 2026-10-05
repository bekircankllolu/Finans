import type { Transaction } from '../types'
import { addMonths, monthKey } from './dates'

export interface InstallmentPlan {
  key: string
  accountId: string | null
  merchant: string
  monthlyAmount: number
  total: number
  lastKnownNo: number
  lastKnownMonth: string
  remainingCount: number
  remainingAmount: number
  endMonth: string
  // Bu aydan itibaren kalan taksitlerin düşeceği aylar
  months: string[]
}

// Kart ekstresindeki "3/6" gibi taksit satırlarından aktif taksit planlarını çıkarır.
// Aynı alışverişin her ay yeni bir satırı geldiği için en son görülen taksit esas alınır.
export function activeInstallments(txns: Transaction[], currentMonth: string): InstallmentPlan[] {
  const latest = new Map<string, Transaction>()
  for (const tx of txns) {
    if (tx.direction !== 'out' || !tx.installment_total || tx.installment_total < 2 || !tx.installment_no) continue
    const key = [tx.account_id ?? '-', tx.merchant, tx.installment_total, Math.round(tx.amount_try)].join('|')
    const prev = latest.get(key)
    if (!prev || tx.installment_no > (prev.installment_no ?? 0)) latest.set(key, tx)
  }

  const plans: InstallmentPlan[] = []
  for (const [key, tx] of latest) {
    const total = tx.installment_total!
    const no = tx.installment_no!
    const lastMonth = monthKey(tx.date)
    const months: string[] = []
    for (let j = 1; j <= total - no; j++) {
      const m = addMonths(lastMonth, j)
      if (m >= currentMonth) months.push(m)
    }
    if (months.length === 0) continue
    plans.push({
      key,
      accountId: tx.account_id,
      merchant: tx.merchant,
      monthlyAmount: tx.amount_try,
      total,
      lastKnownNo: no,
      lastKnownMonth: lastMonth,
      remainingCount: months.length,
      remainingAmount: months.length * tx.amount_try,
      endMonth: months.at(-1)!,
      months,
    })
  }
  return plans.sort((a, b) => b.remainingAmount - a.remainingAmount)
}

export function installmentLoadByMonth(plans: InstallmentPlan[]): Map<string, number> {
  const load = new Map<string, number>()
  for (const p of plans) {
    for (const m of p.months) load.set(m, (load.get(m) ?? 0) + p.monthlyAmount)
  }
  return load
}
