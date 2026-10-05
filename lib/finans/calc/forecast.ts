import type { FxRates, IncomeSource } from '../types'
import { addMonths, monthKey } from './dates'
import type { LoanStatus } from './loans'
import { toTRY } from './networth'

export interface ForecastMonth {
  month: string
  income: number
  baseSpend: number
  loanPayments: number
  cardInstallments: number
  extraOutflows: number
  net: number
  endBalance: number
}

export interface ForecastInput {
  startMonth: string
  months: number
  // Bugünkü net nakit: likit varlık − kart borcu − KMH borcu
  startBalance: number
  incomes: IncomeSource[]
  fx: FxRates
  baseSpend: number
  loans: LoanStatus[]
  installmentLoad: Map<string, number>
  // Simülasyon: ek aylık gider (ör. yeni bir taksit) — ay → tutar
  extra?: Map<string, number>
}

export function monthlyRecurringIncome(incomes: IncomeSource[], fx: FxRates): number {
  return incomes
    .filter(i => i.is_active && i.is_recurring)
    .reduce((s, i) => s + (toTRY(i.amount, i.currency, fx) ?? 0), 0)
}

export function forecast(input: ForecastInput): ForecastMonth[] {
  const income = monthlyRecurringIncome(input.incomes, input.fx)
  const rows: ForecastMonth[] = []
  let balance = input.startBalance

  for (let i = 0; i < input.months; i++) {
    const month = addMonths(input.startMonth, i)
    const loanPayments = input.loans.reduce(
      (s, l) => s + l.installments.filter(x => !x.paid && monthKey(x.due_date) === month).reduce((a, x) => a + x.total, 0),
      0,
    )
    const cardInstallments = input.installmentLoad.get(month) ?? 0
    const extraOutflows = input.extra?.get(month) ?? 0
    const net = income - input.baseSpend - loanPayments - cardInstallments - extraOutflows
    balance += net
    rows.push({ month, income, baseSpend: input.baseSpend, loanPayments, cardInstallments, extraOutflows, net, endBalance: balance })
  }
  return rows
}
