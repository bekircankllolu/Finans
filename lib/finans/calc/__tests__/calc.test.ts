import { describe, expect, it } from 'vitest'
import { addMonths, addMonthsToDate, dateInMonth, diffDays, lastMonths } from '../dates'
import { annuityPayment, buildSchedule, loanStatus } from '../loans'
import { activeInstallments, installmentLoadByMonth } from '../installments'
import { simulate, compareStrategies, type Debt } from '../debtStrategy'
import { summarizeMonths, baseMonthlySpend } from '../cashflow'
import { forecast } from '../forecast'
import { detectRecurring } from '../recurring'
import { dedupeKeys, maskSensitive, matchRule, normalizeMerchant } from '../../merchant'
import type { Category, Loan, Transaction } from '../../types'

const cat = (id: string, name: string, kind: Category['kind'], is_fixed = false): Category => ({
  id, name, kind, color: '#000', is_fixed, sort: 0,
})
const CATS = [
  cat('market', 'Market', 'expense'),
  cat('kira', 'Kira', 'expense', true),
  cat('maas', 'Maaş', 'income'),
  cat('transfer', 'Transfer', 'transfer'),
  cat('loanpay', 'Kredi Ödemesi', 'expense', true),
]

let n = 0
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, account_id: 'acc', statement_id: null, date: '2026-09-10', description: 'X', merchant: 'X',
  amount: 100, direction: 'out', currency: 'TRY', amount_try: p.amount ?? 100, category_id: null,
  installment_no: null, installment_total: null, source: 'statement', notes: null, tx_type: null, ...p,
})

describe('dates', () => {
  it('ay aritmetiği yıl geçişlerini doğru yapar', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(diffDays('2026-10-01', '2026-10-06')).toBe(5)
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('loans', () => {
  const input = { principal: 100_000, monthlyRatePct: 3.29, termMonths: 12, firstDueDate: '2026-01-15', includeTaxes: true }

  it('annuity taksiti vergilerle beraber sabittir ve anapara tam kapanır', () => {
    const rows = buildSchedule(input)
    expect(rows).toHaveLength(12)
    const payment = annuityPayment(100_000, 3.29, 12, true)
    // %3,29 + %30 vergi → efektif %4,277; 12 ay
    expect(payment).toBeCloseTo(10_827.17, 1)
    rows.slice(0, -1).forEach(r => expect(r.total).toBeCloseTo(payment, 1))
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(100_000, 0)
    expect(rows.at(-1)!.remaining_principal).toBe(0)
    expect(rows[0].tax).toBeCloseTo(rows[0].interest * 0.3, 1)
    expect(rows[11].due_date).toBe('2026-12-15')
  })

  it('faizsiz kredi eşit bölünür', () => {
    expect(annuityPayment(1200, 0, 12, false)).toBe(100)
  })

  it('kalan borç ve erken kapama hesaplanır', () => {
    const loan: Loan = { id: 'L', name: 'İhtiyaç', bank: null, principal: 100_000, monthly_rate: 3.29, term_months: 12, first_due_date: '2026-01-15', include_taxes: true }
    const inst = buildSchedule(input, '2026-04-01').map(r => ({ ...r, loan_id: 'L' }))
    const st = loanStatus(loan, inst)
    expect(st.paidCount).toBe(3)
    expect(st.remainingCount).toBe(9)
    expect(st.nextDue?.no).toBe(4)
    expect(st.earlyPayoffAmount).toBeCloseTo(st.remainingPrincipal * 1.01, 0)
    expect(st.earlyPayoffSavings).toBeGreaterThan(0)
  })
})

describe('installments', () => {
  it('en son görülen taksitten kalanları projekte eder', () => {
    const txns = [
      tx({ merchant: 'TEKNOSA', amount: 1000, amount_try: 1000, date: '2026-08-05', installment_no: 2, installment_total: 6 }),
      tx({ merchant: 'TEKNOSA', amount: 1000, amount_try: 1000, date: '2026-09-05', installment_no: 3, installment_total: 6 }),
      tx({ merchant: 'BITMIS', amount: 500, amount_try: 500, date: '2026-09-05', installment_no: 3, installment_total: 3 }),
    ]
    const plans = activeInstallments(txns, '2026-10')
    expect(plans).toHaveLength(1)
    expect(plans[0].months).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(plans[0].remainingAmount).toBe(3000)
    expect(installmentLoadByMonth(plans).get('2026-11')).toBe(1000)
  })
})

describe('debtStrategy', () => {
  const debts: Debt[] = [
    { id: 'a', name: 'Kart A', kind: 'card', balance: 20_000, monthlyRatePct: 5.5, minPayment: 4000 },
    { id: 'b', name: 'Kredi', kind: 'loan', balance: 5_000, monthlyRatePct: 2, minPayment: 1000 },
  ]

  it('avalanche toplam faizde snowball’dan kötü olamaz', () => {
    const r = compareStrategies(debts, 2000)
    expect(r.avalanche.feasible).toBe(true)
    expect(r.avalanche.totalInterest).toBeLessThanOrEqual(r.snowball.totalInterest + 0.01)
    expect(r.avalanche.months).toBeLessThanOrEqual(r.minimum.months)
    expect(r.snowball.payoffOrder[0].id).toBe('b')
  })

  it('bütçe faizi karşılamıyorsa uygulanamaz', () => {
    const r = simulate([{ id: 'x', name: 'x', kind: 'card', balance: 100_000, monthlyRatePct: 5, minPayment: 1000 }], 0, 'avalanche')
    expect(r.feasible).toBe(false)
  })
})

describe('cashflow', () => {
  it('transferleri gelir/giderden hariç tutar, iadeleri düşer', () => {
    const txns = [
      tx({ category_id: 'maas', direction: 'in', amount: 50_000, amount_try: 50_000 }),
      tx({ category_id: 'market', amount: 4_000, amount_try: 4_000 }),
      tx({ category_id: 'market', direction: 'in', amount: 500, amount_try: 500 }),
      tx({ category_id: 'kira', amount: 15_000, amount_try: 15_000 }),
      tx({ category_id: 'transfer', amount: 20_000, amount_try: 20_000 }),
    ]
    const [s] = summarizeMonths(txns, CATS, ['2026-09'])
    expect(s.income).toBe(50_000)
    expect(s.expense).toBe(18_500)
    expect(s.fixedExpense).toBe(15_000)
    expect(s.net).toBe(31_500)
    expect(s.byCategory.market).toBe(3_500)
  })

  it('taban harcama taksit ve kredi ödemelerini dışlar', () => {
    const txns = [
      tx({ category_id: 'market', amount: 3_000, amount_try: 3_000, date: '2026-08-10' }),
      tx({ category_id: 'market', amount: 5_000, amount_try: 5_000, date: '2026-09-10' }),
      tx({ category_id: 'market', amount: 999, amount_try: 999, date: '2026-09-11', installment_no: 1, installment_total: 3 }),
      tx({ category_id: 'loanpay', amount: 7_000, amount_try: 7_000, date: '2026-09-12' }),
    ]
    expect(baseMonthlySpend(txns, CATS, ['2026-08', '2026-09'])).toBe(4_000)
  })
})

describe('forecast', () => {
  it('gelir, taban gider, kredi ve taksitlerle bakiyeyi yürütür', () => {
    const rows = forecast({
      startMonth: '2026-10', months: 2, startBalance: 10_000, fx: {}, baseSpend: 30_000, loans: [],
      incomes: [{ id: 'i', name: 'Maaş', kind: 'salary', amount: 50_000, currency: 'TRY', day_of_month: 1, is_recurring: true, is_active: true }],
      installmentLoad: new Map([['2026-11', 5_000]]),
    })
    expect(rows[0].endBalance).toBe(30_000)
    expect(rows[1].net).toBe(15_000)
    expect(rows[1].endBalance).toBe(45_000)
  })
})

describe('recurring', () => {
  it('3+ ay benzer tutarlı ödemeleri bulur', () => {
    const txns = ['2026-07', '2026-08', '2026-09'].flatMap(m => [
      tx({ merchant: 'NETFLIX.COM', amount: 230, amount_try: 230, date: `${m}-03`, category_id: 'market' }),
      tx({ merchant: 'RASTGELE', amount: m === '2026-08' ? 5000 : 100, amount_try: m === '2026-08' ? 5000 : 100, date: `${m}-04`, category_id: 'market' }),
    ])
    const r = detectRecurring(txns, CATS, '2026-04')
    expect(r.map(x => x.merchant)).toEqual(['NETFLIX.COM'])
    expect(r[0].yearlyCost).toBe(2760)
  })
})

describe('merchant', () => {
  it('normalize eder, kuralları eşler, hassas veriyi maskeler', () => {
    expect(normalizeMerchant('MIGROS 4521 ISTANBUL TR')).toBe('MIGROS')
    expect(matchRule('Migros 1234 Alanya', [{ pattern: 'migros', category_id: 'market' }])).toBe('market')
    expect(matchRule('XYZ', [{ pattern: 'migros', category_id: 'market' }])).toBeNull()
    expect(maskSensitive('Kart 4543 1234 5678 9012')).toBe('Kart **** 9012')
    expect(maskSensitive('IBAN TR12 0006 4000 0011 2345 6789 01')).toContain('8901')
    expect(maskSensitive('IBAN TR12 0006 4000 0011 2345 6789 01')).not.toContain('0006')
  })

  it('aynı gün aynı tutarlı işlemleri ayırır', () => {
    const t = { date: '2026-09-01', amount: 50, direction: 'out', description: 'KAHVE' }
    const keys = dedupeKeys('acc', [t, t])
    expect(keys[0]).not.toBe(keys[1])
    expect(dedupeKeys('acc', [t, t])).toEqual(keys)
  })
})

describe('snapshot (demo verisi)', async () => {
  const { demoData } = await import('../../demo')
  const { buildSnapshot } = await import('../snapshot')
  const { todayISO, addMonths, monthKey } = await import('../dates')

  it('uçtan uca hesaplanır ve odak ay tamamlanmış son aydır', () => {
    const today = todayISO()
    const s = buildSnapshot(demoData(), today)
    expect(s.focusMonth).toBe(addMonths(monthKey(today), -1))
    expect(s.months).toHaveLength(12)
    expect(s.forecast).toHaveLength(6)
    expect(s.cards).toHaveLength(2)
    expect(s.loans[0].remainingCount).toBeGreaterThan(0)
    expect(s.installments.length).toBeGreaterThan(0)
    expect(s.health.score).toBeGreaterThanOrEqual(0)
    expect(s.health.score).toBeLessThanOrEqual(100)
    // Transferler gelir sayılmaz: maaş + freelance dışında gelir yok
    expect(s.focus.income).toBeGreaterThanOrEqual(92_000)
    expect(s.alerts.every(a => a.key && a.title)).toBe(true)
  })
})
