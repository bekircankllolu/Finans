import type { Account, Budget, FinanceData, Goal } from '../types'
import { baseMonthlySpend, categoryBreakdown, type CategorySlice, type MonthSummary, summarizeMonths } from './cashflow'
import { addMonths, dateInMonth, lastMonths, monthKey, monthsBetween } from './dates'
import { compareStrategies, type Debt } from './debtStrategy'
import { forecast, type ForecastMonth, monthlyRecurringIncome } from './forecast'
import { activeInstallments, installmentLoadByMonth, type InstallmentPlan } from './installments'
import { CONSUMER_LOAN_TAX_RATE, loanStatus, type LoanStatus } from './loans'
import { computeNetWorth, type NetWorth } from './networth'
import { detectRecurring, type RecurringPayment } from './recurring'
import { buildAlerts, type Alert } from './alerts'

// TCMB'nin TL kartlar için azami akdi faizine yakın varsayılan; hesap ayarından değiştirilebilir.
export const DEFAULT_CARD_RATE = 4.25

export interface CardSummary {
  account: Account
  balance: number
  limit: number | null
  utilization: number | null
  dueDate: string | null
  minPayment: number
  statementDebt: number | null
}

export interface BudgetProgress {
  budget: Budget
  categoryName: string
  color: string
  spent: number
  ratio: number
  projected: number
}

export interface GoalProgress {
  goal: Goal
  ratio: number
  remaining: number
  monthsLeft: number | null
  requiredMonthly: number | null
}

export interface HealthFactor {
  key: string
  label: string
  value: string
  score: number // 0-1
  hint: string
}

export interface Snapshot {
  today: string
  currentMonth: string
  focusMonth: string
  months: MonthSummary[]
  focus: MonthSummary
  focusPrev: MonthSummary | null
  breakdown: CategorySlice[]
  netWorth: NetWorth
  loans: LoanStatus[]
  cards: CardSummary[]
  kmh: Account[]
  installments: InstallmentPlan[]
  baseSpend: number
  recurringIncome: number
  forecast: ForecastMonth[]
  debts: Debt[]
  suggestedExtra: number
  strategies: ReturnType<typeof compareStrategies>
  budgets: BudgetProgress[]
  goals: GoalProgress[]
  recurring: RecurringPayment[]
  health: { score: number; factors: HealthFactor[] }
  alerts: Alert[]
}

// Kartın asgari ödemesi: ekstrede yazıyorsa o, yoksa limite göre %20 / %40 yaklaşık kuralı
export function cardMinPct(limit: number | null): number {
  return limit != null && limit > 50_000 ? 0.4 : 0.2
}

function nextDueDate(day: number | null, today: string): string | null {
  if (!day) return null
  const thisMonth = dateInMonth(monthKey(today), day)
  return thisMonth >= today ? thisMonth : dateInMonth(addMonths(monthKey(today), 1), day)
}

export function buildSnapshot(data: FinanceData, today: string): Snapshot {
  const currentMonth = monthKey(today)
  const months = lastMonths(currentMonth, 12)
  const summaries = summarizeMonths(data.transactions, data.categories, months)

  // Odak ay: verisi olan en son *tamamlanmış* ay. İçinde bulunulan ay yarım olduğu için
  // karşılaştırmaları yanıltır; sadece başka veri yoksa kullanılır.
  const completeIdx = summaries.slice(0, -1).map(s => s.txCount > 0).lastIndexOf(true)
  const fi = completeIdx !== -1 ? completeIdx : summaries.length - 1
  const focus = summaries[fi]
  const focusPrev = fi > 0 ? summaries[fi - 1] : null
  const breakdown = categoryBreakdown(focus, summaries.slice(0, fi), data.categories)

  const loans = data.loans.map(l => loanStatus(l, data.installments))
  const netWorth = computeNetWorth(data.accounts, data.holdings, loans, data.fx)

  const confirmed = data.statements
    .filter(s => s.status === 'confirmed' && s.kind === 'bank_statement')
    .sort((a, b) => (b.period_end ?? b.created_at).localeCompare(a.period_end ?? a.created_at))

  const cards: CardSummary[] = data.accounts
    .filter(a => a.is_active && a.type === 'credit_card')
    .map(a => {
      const st = confirmed.find(s => s.account_id === a.id)
      const stDue = st?.due_date && st.due_date >= today ? st.due_date : null
      const minPayment = stDue && st?.min_payment != null ? st.min_payment : a.balance * cardMinPct(a.credit_limit)
      return {
        account: a,
        balance: a.balance,
        limit: a.credit_limit,
        utilization: a.credit_limit ? a.balance / a.credit_limit : null,
        dueDate: stDue ?? nextDueDate(a.due_day, today),
        minPayment: Math.min(minPayment, a.balance),
        statementDebt: stDue ? st?.total_debt ?? null : null,
      }
    })
  const kmh = data.accounts.filter(a => a.is_active && a.type === 'kmh' && a.balance > 0)

  const installments = activeInstallments(data.transactions, currentMonth)
  const completeMonths = summaries.slice(0, fi + 1).filter(s => s.txCount > 0).slice(-3).map(s => s.month)
  const baseSpend = baseMonthlySpend(data.transactions, data.categories, completeMonths)
  const recurringIncome = monthlyRecurringIncome(data.incomes, data.fx)

  const fc = forecast({
    startMonth: currentMonth,
    months: 6,
    startBalance: netWorth.liquid - netWorth.cardDebt - netWorth.kmhDebt,
    incomes: data.incomes,
    fx: data.fx,
    baseSpend,
    loans,
    installmentLoad: installmentLoadByMonth(installments),
  })

  const debts: Debt[] = [
    ...cards
      .filter(c => c.balance > 0)
      .map(c => ({
        id: c.account.id,
        name: c.account.name,
        kind: 'card' as const,
        balance: c.balance,
        monthlyRatePct: (c.account.monthly_rate ?? DEFAULT_CARD_RATE) * (1 + CONSUMER_LOAN_TAX_RATE),
        minPayment: c.minPayment,
        minPct: cardMinPct(c.limit),
      })),
    ...kmh.map(a => ({
      id: a.id,
      name: a.name,
      kind: 'kmh' as const,
      balance: a.balance,
      monthlyRatePct: (a.monthly_rate ?? DEFAULT_CARD_RATE) * (1 + CONSUMER_LOAN_TAX_RATE),
      minPayment: a.balance * 0.1,
    })),
    ...loans
      .filter(l => l.remainingPrincipal > 0)
      .map(l => ({
        id: l.loan.id,
        name: l.loan.name,
        kind: 'loan' as const,
        balance: l.remainingPrincipal,
        monthlyRatePct: l.loan.monthly_rate * (l.loan.include_taxes ? 1 + CONSUMER_LOAN_TAX_RATE : 1),
        minPayment: l.monthlyPayment,
      })),
  ]
  const avgNet = fc.length ? fc.reduce((s, f) => s + f.net, 0) / fc.length : 0
  const suggestedExtra = Math.max(0, Math.round((avgNet * 0.5) / 500) * 500)
  const strategies = compareStrategies(debts, suggestedExtra)

  const catById = new Map(data.categories.map(c => [c.id, c]))
  const currentSummary = summaries.at(-1)!
  const dayOfMonth = Number(today.slice(8, 10))
  const monthLen = Number(dateInMonth(currentMonth, 31).slice(8, 10))
  const budgets: BudgetProgress[] = data.budgets.map(b => {
    const spent = currentSummary.byCategory[b.category_id] ?? 0
    const cat = catById.get(b.category_id)
    return {
      budget: b,
      categoryName: cat?.name ?? '—',
      color: cat?.color ?? '#8B8B9E',
      spent,
      ratio: spent / b.monthly_limit,
      // Ayın ilk günlerinde tahmin çok oynak; 10. günden sonra projeksiyon yapılır
      projected: dayOfMonth >= 10 ? (spent / dayOfMonth) * monthLen : spent,
    }
  })

  const goals: GoalProgress[] = data.goals.map(g => {
    const remaining = Math.max(0, g.target_amount - g.current_amount)
    const monthsLeft = g.target_date ? Math.max(1, monthsBetween(currentMonth, monthKey(g.target_date))) : null
    return {
      goal: g,
      ratio: Math.min(1, g.current_amount / g.target_amount),
      remaining,
      monthsLeft,
      requiredMonthly: monthsLeft ? remaining / monthsLeft : null,
    }
  })

  const recurring = detectRecurring(data.transactions, data.categories, addMonths(currentMonth, -6))
  const health = healthScore({ summaries, fi, netWorth, cards, loans, recurringIncome, baseSpend })

  const alerts = buildAlerts({
    today,
    currentMonth,
    focus,
    breakdown,
    cards,
    kmh,
    loans,
    budgets,
    forecast: fc,
    recurring,
    accounts: data.accounts,
    lastStatementByAccount: new Map(
      data.accounts.map(a => [a.id, confirmed.find(s => s.account_id === a.id)?.period_end ?? null]),
    ),
  }).filter(a => !data.dismissed.includes(a.key))

  return {
    today,
    currentMonth,
    focusMonth: focus.month,
    months: summaries,
    focus,
    focusPrev,
    breakdown,
    netWorth,
    loans,
    cards,
    kmh,
    installments,
    baseSpend,
    recurringIncome,
    forecast: fc,
    debts,
    suggestedExtra,
    strategies,
    budgets,
    goals,
    recurring,
    health,
    alerts,
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function healthScore(p: {
  summaries: MonthSummary[]
  fi: number
  netWorth: NetWorth
  cards: CardSummary[]
  loans: LoanStatus[]
  recurringIncome: number
  baseSpend: number
}): Snapshot['health'] {
  const recent = p.summaries.slice(0, p.fi + 1).filter(s => s.txCount > 0).slice(-3)
  const income = recent.length ? recent.reduce((s, m) => s + m.income, 0) / recent.length : 0
  const expense = recent.length ? recent.reduce((s, m) => s + m.expense, 0) / recent.length : 0
  const monthlyIncome = Math.max(income, p.recurringIncome)
  const savingsRate = monthlyIncome > 0 ? (monthlyIncome - expense) / monthlyIncome : 0
  const debtService =
    p.loans.reduce((s, l) => s + l.monthlyPayment, 0) + p.cards.reduce((s, c) => s + c.minPayment, 0)
  const dti = monthlyIncome > 0 ? debtService / monthlyIncome : 1
  const emergencyMonths = expense > 0 ? p.netWorth.liquid / expense : 0
  const totalLimit = p.cards.reduce((s, c) => s + (c.limit ?? 0), 0)
  const utilization = totalLimit > 0 ? p.cards.reduce((s, c) => s + c.balance, 0) / totalLimit : 0

  const pct = (n: number) => `%${Math.round(n * 100)}`
  const factors: HealthFactor[] = [
    {
      key: 'savings',
      label: 'Tasarruf oranı',
      value: pct(savingsRate),
      score: clamp01(savingsRate / 0.2),
      hint: 'Gelirin en az %20’si kenara kalmalı.',
    },
    {
      key: 'dti',
      label: 'Borç servisi / gelir',
      value: pct(dti),
      score: clamp01(1 - (dti - 0.2) / 0.3),
      hint: 'Aylık borç ödemeleri gelirin %35’ini aşmamalı.',
    },
    {
      key: 'emergency',
      label: 'Acil durum fonu',
      value: `${emergencyMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay`,
      score: clamp01(emergencyMonths / 3),
      hint: 'En az 3 aylık gideri karşılayacak nakit önerilir.',
    },
    {
      key: 'utilization',
      label: 'Kart limit kullanımı',
      value: pct(utilization),
      score: clamp01(1 - (utilization - 0.3) / 0.5),
      hint: 'Limitin %30’unun altında kalmak kredi notuna iyi gelir.',
    },
  ]
  const score = Math.round((factors.reduce((s, f) => s + f.score, 0) / factors.length) * 100)
  return { score, factors }
}

