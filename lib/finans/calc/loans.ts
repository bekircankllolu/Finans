import type { Loan, LoanInstallment } from '../types'
import { CONSUMER_TAX_RATE, earlyRepaymentFeeRate } from '../regulations'
import { addMonthsToDate } from './dates'

// Tüketici kredilerinde faiz üzerinden KKDF + BSMV alınır (oranlar regulations.ts'te).
export const CONSUMER_LOAN_TAX_RATE = CONSUMER_TAX_RATE

const round2 = (n: number) => Math.round(n * 100) / 100

export interface ScheduleInput {
  principal: number
  monthlyRatePct: number
  termMonths: number
  firstDueDate: string
  includeTaxes: boolean
}

export function annuityPayment(principal: number, monthlyRatePct: number, termMonths: number, includeTaxes: boolean): number {
  const r = (monthlyRatePct / 100) * (includeTaxes ? 1 + CONSUMER_LOAN_TAX_RATE : 1)
  if (r === 0) return principal / termMonths
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths))
}

export function buildSchedule(input: ScheduleInput, today?: string): Omit<LoanInstallment, 'loan_id' | 'id'>[] {
  const { principal, monthlyRatePct, termMonths, firstDueDate, includeTaxes } = input
  const r = monthlyRatePct / 100
  const payment = annuityPayment(principal, monthlyRatePct, termMonths, includeTaxes)
  const rows: Omit<LoanInstallment, 'loan_id' | 'id'>[] = []
  let balance = principal

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * r
    const tax = includeTaxes ? interest * CONSUMER_LOAN_TAX_RATE : 0
    let principalPart = payment - interest - tax
    if (i === termMonths) principalPart = balance
    balance = Math.max(0, balance - principalPart)
    const dueDate = addMonthsToDate(firstDueDate, i - 1)
    rows.push({
      no: i,
      due_date: dueDate,
      principal: round2(principalPart),
      interest: round2(interest),
      tax: round2(tax),
      total: round2(principalPart + interest + tax),
      remaining_principal: round2(balance),
      paid: today ? dueDate < today : false,
    })
  }
  return rows
}

export interface LoanStatus {
  loan: Loan
  installments: LoanInstallment[]
  paidCount: number
  remainingCount: number
  remainingPrincipal: number
  remainingInterest: number
  remainingTotal: number
  totalInterest: number
  nextDue: LoanInstallment | null
  monthlyPayment: number
  endDate: string | null
  progress: number
  // Erken kapama: kalan anapara + yasal üst sınır erken ödeme tazminatı (kalan vade ≤36 ay %1, üstü %2)
  earlyPayoffAmount: number
  earlyPayoffSavings: number
}

export function loanStatus(loan: Loan, all: LoanInstallment[]): LoanStatus {
  const installments = all.filter(i => i.loan_id === loan.id).sort((a, b) => a.no - b.no)
  const unpaid = installments.filter(i => !i.paid)
  const remainingPrincipal = round2(unpaid.reduce((s, i) => s + i.principal, 0))
  const remainingInterest = round2(unpaid.reduce((s, i) => s + i.interest + i.tax, 0))
  const remainingTotal = round2(unpaid.reduce((s, i) => s + i.total, 0))
  const fee = remainingPrincipal * earlyRepaymentFeeRate(unpaid.length)
  const earlyPayoffAmount = round2(remainingPrincipal + fee)

  return {
    loan,
    installments,
    paidCount: installments.length - unpaid.length,
    remainingCount: unpaid.length,
    remainingPrincipal,
    remainingInterest,
    remainingTotal,
    totalInterest: round2(installments.reduce((s, i) => s + i.interest + i.tax, 0)),
    nextDue: unpaid[0] ?? null,
    monthlyPayment: unpaid[0]?.total ?? 0,
    endDate: installments.at(-1)?.due_date ?? null,
    progress: installments.length ? (installments.length - unpaid.length) / installments.length : 0,
    earlyPayoffAmount,
    earlyPayoffSavings: round2(Math.max(0, remainingTotal - earlyPayoffAmount)),
  }
}
