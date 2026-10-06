import { describe, expect, it } from 'vitest'
import { spendingBreakdown } from '../spending'
import { summarizePeriod } from '../period'
import type { Account, Category, Transaction } from '../../types'

const categories: Category[] = [
  { id: 'food', name: 'Yemek', kind: 'expense', color: '', is_fixed: false, sort: 0 },
  { id: 'transfer', name: 'Transfer', kind: 'transfer', color: '', is_fixed: false, sort: 1 },
]
const transaction = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, amount, amount_try: amount, date: '2026-09-10', direction: 'out', category_id: 'food', account_id: null,
  statement_id: null, description: id, merchant: id, currency: 'TRY', installment_no: null, installment_total: null,
  source: 'manual', notes: null, tx_type: null, ...extra,
})
const month = { month: '2026-09', mode: 'month' as const }

describe('interactive spending breakdown', () => {
  it('excludes transfers and other months; separates refunds without inflating income', () => {
    const rows = [transaction('purchase', 500), transaction('refund', 100, { direction: 'in' }), transaction('transfer', 900, { category_id: 'transfer' }), transaction('old', 700, { date: '2026-08-10' })]
    const result = spendingBreakdown(rows, categories, [], [], month)
    expect(result.total).toBe(500)
    expect(result.refunds).toBe(100)
    expect(result.slices[0].rows.map(r => r.amount)).toEqual([500, -100])
    const summary = summarizePeriod(rows, categories, [], [], month)
    expect(result.total - result.refunds).toBe(summary.expense)
    expect(summary.income).toBe(0)
  })
  it('uses each card’s statement period for both slices and drill-down rows', () => {
    const account = { id: 'card', name: 'Kart', type: 'credit_card', statement_day: 20 } as Account
    const rows = [transaction('previous-month', 400, { account_id: 'card', date: '2026-08-25' }), transaction('next-statement', 800, { account_id: 'card', date: '2026-09-25' })]
    const result = spendingBreakdown(rows, categories, [account], [], { month: '2026-09', mode: 'card' })
    expect(result.total).toBe(400)
    expect(result.slices[0].rows.map(r => r.id)).toEqual(['previous-month'])
    expect(result.slices[0].rows[0].account).toBe('Kart')
  })
  it('keeps every transaction and amount when small categories are grouped', () => {
    const rows = Array.from({ length: 10 }, (_, i) => transaction(`tx-${i}`, i + 1, { category_id: `category-${i}` }))
    const result = spendingBreakdown(rows, categories, [], [], month)
    expect(result.slices).toHaveLength(7)
    expect(result.slices.at(-1)?.id).toBe('other')
    expect(result.slices.reduce((sum, s) => sum + s.amount, 0)).toBe(55)
    expect(result.slices.flatMap(s => s.rows)).toHaveLength(10)
  })
  it('handles refund-only and empty periods without negative pie slices', () => {
    const result = spendingBreakdown([transaction('refund', 200, { direction: 'in' })], categories, [], [], month)
    expect(result).toEqual({ slices: [], total: 0, refunds: 200 })
    expect(spendingBreakdown([], categories, [], [], month)).toEqual({ slices: [], total: 0, refunds: 0 })
  })
})
