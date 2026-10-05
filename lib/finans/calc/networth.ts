import type { Account, FxRates, Holding } from '../types'
import type { LoanStatus } from './loans'

const FX_ASSETS = new Set(['USD', 'EUR', 'GBP', 'XAU'])

export function toTRY(amount: number, currency: string, fx: FxRates): number | null {
  if (currency === 'TRY') return amount
  const rate = fx[currency as keyof FxRates]
  return rate ? amount * rate : null
}

export function holdingValueTRY(h: Holding, fx: FxRates): number | null {
  if (h.asset === 'TRY') return h.quantity
  if (FX_ASSETS.has(h.asset)) return toTRY(h.quantity, h.asset, fx)
  return h.unit_price_try != null ? h.quantity * h.unit_price_try : null
}

export interface NetWorth {
  liquid: number
  investments: number
  cardDebt: number
  kmhDebt: number
  loanDebt: number
  assets: number
  liabilities: number
  netWorth: number
  // Kur bulunamadığı için hesaba katılamayan kalemler
  unpriced: string[]
}

export function computeNetWorth(accounts: Account[], holdings: Holding[], loans: LoanStatus[], fx: FxRates): NetWorth {
  const unpriced: string[] = []
  let liquid = 0
  let investments = 0
  let cardDebt = 0
  let kmhDebt = 0

  for (const a of accounts) {
    if (!a.is_active) continue
    const v = toTRY(a.balance, a.currency, fx)
    if (v == null) {
      unpriced.push(a.name)
      continue
    }
    if (a.type === 'checking' || a.type === 'savings' || a.type === 'cash') liquid += v
    else if (a.type === 'investment') investments += v
    else if (a.type === 'credit_card') cardDebt += v
    else if (a.type === 'kmh') kmhDebt += v
  }

  for (const h of holdings) {
    const v = holdingValueTRY(h, fx)
    if (v == null) unpriced.push(h.name)
    else investments += v
  }

  const loanDebt = loans.reduce((s, l) => s + l.remainingPrincipal, 0)
  const assets = liquid + investments
  const liabilities = cardDebt + kmhDebt + loanDebt
  return { liquid, investments, cardDebt, kmhDebt, loanDebt, assets, liabilities, netWorth: assets - liabilities, unpriced }
}
