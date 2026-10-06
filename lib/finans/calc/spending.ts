import type { Account, Category, Statement, Transaction } from '../types'
import { categoryMap, signedExpense } from './cashflow'
import { accountPeriods, inPeriod, type PeriodSelection } from './period'

export interface SpendingRow {
  id: string
  date: string
  merchant: string
  category: string
  account: string
  amount: number
}
export interface SpendingSlice {
  id: string
  name: string
  amount: number
  refunds: number
  rows: SpendingRow[]
}

// Same period and transfer/refund rules as the dashboard. The pie represents purchases;
// refunds are shown separately so no negative value is drawn as a positive slice.
export function spendingBreakdown(txns: Transaction[], categories: Category[], accounts: Account[], statements: Statement[], selection: PeriodSelection) {
  const cats = categoryMap(categories)
  const periods = accountPeriods(selection, accounts, statements)
  const names = new Map(accounts.map(a => [a.id, a.name]))
  const groups = new Map<string, SpendingSlice>()
  for (const tx of txns) {
    if (!inPeriod(tx, selection, periods)) continue
    const amount = signedExpense(tx, cats)
    if (amount === 0) continue
    const id = tx.category_id ?? 'uncategorized'
    const name = cats.get(id)?.name ?? 'Kategorisiz'
    const group = groups.get(id) ?? { id, name, amount: 0, refunds: 0, rows: [] }
    if (amount > 0) group.amount += amount
    else group.refunds -= amount
    group.rows.push({ id: tx.id, date: tx.date, merchant: tx.merchant || tx.description, category: name, account: names.get(tx.account_id ?? '') ?? 'Nakit / hesapsız', amount })
    groups.set(id, group)
  }
  const all = [...groups.values()].sort((a, b) => b.amount - a.amount)
  const purchases = all.filter(g => g.amount > 0)
  const slices = purchases.slice(0, 6)
  if (purchases.length > 6) {
    const rest = purchases.slice(6)
    slices.push({ id: 'other', name: 'Diğer harcamalar', amount: rest.reduce((sum, g) => sum + g.amount, 0), refunds: rest.reduce((sum, g) => sum + g.refunds, 0), rows: rest.flatMap(g => g.rows) })
  }
  for (const slice of slices) slice.rows.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount))
  return { slices, total: all.reduce((sum, g) => sum + g.amount, 0), refunds: all.reduce((sum, g) => sum + g.refunds, 0) }
}
