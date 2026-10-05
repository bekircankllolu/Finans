import { describe, expect, it } from 'vitest'
import { accountPeriods, summarizePeriod } from '../period'
import type { Account, Category, Statement, Transaction } from '../../types'

const cat = (id: string, name: string, kind: Category['kind'], is_fixed = false): Category => ({ id, name, kind, color: '#000', is_fixed, sort: 0 })
const CATS = [cat('market', 'Market', 'expense'), cat('kira', 'Kira & Aidat', 'expense', true), cat('maas', 'Maaş', 'income'), cat('tr', 'Transfer', 'transfer'), cat('faiz', 'Faiz & Banka Ücretleri', 'expense')]

const acc = (id: string, type: Account['type'], extra: Partial<Account> = {}): Account => ({
  id, type, bank: 'Garanti BBVA', name: id, currency: 'TRY', last4: null, credit_limit: null, balance: 0, balance_updated_at: null,
  statement_day: null, due_day: null, monthly_rate: null, is_active: true, ...extra,
})

let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'direction'>): Transaction => ({
  id: `t${n++}`, account_id: 'card', statement_id: null, description: p.merchant ?? 'X', merchant: 'X', currency: 'TRY', amount_try: p.amount,
  category_id: 'market', installment_no: null, installment_total: null, source: 'statement', notes: null, tx_type: null, ...p,
})

const ACCOUNTS = [acc('card', 'credit_card', { statement_day: 20 }), acc('vadesiz', 'checking')]
const STATEMENTS: Statement[] = [
  { id: 's1', account_id: 'card', kind: 'bank_statement', file_name: 'x.pdf', mime_type: 'application/pdf', status: 'confirmed', period_start: '2026-08-21', period_end: '2026-09-20', due_date: '2026-09-30', total_debt: 1000, min_payment: 200, closing_balance: null, bank: 'Garanti BBVA', previous_balance: 0, reconcile_status: 'ok', reconcile_diff: 0, error: null, created_at: '2026-09-21', confirmed_at: '2026-09-21' },
]

const TXNS = [
  tx({ date: '2026-08-25', amount: 500, direction: 'out', merchant: 'MIGROS' }), // kart dönemi içinde, takvim ayı dışında
  tx({ date: '2026-09-10', amount: 300, direction: 'out', merchant: 'MIGROS' }),
  tx({ date: '2026-09-25', amount: 200, direction: 'out', merchant: 'A101' }), // takvim ayı içinde, kart dönemi dışında
  tx({ date: '2026-09-12', amount: 900, direction: 'out', merchant: 'TAKSIT', installment_no: 2, installment_total: 6 }),
  tx({ date: '2026-09-15', amount: 50, direction: 'out', merchant: 'FAIZ', category_id: 'faiz', tx_type: 'interest' }),
  tx({ date: '2026-09-01', amount: 90_000, direction: 'in', merchant: 'MAAS', category_id: 'maas', account_id: 'vadesiz' }),
  tx({ date: '2026-09-03', amount: 28_000, direction: 'out', merchant: 'KIRA', category_id: 'kira', account_id: 'vadesiz' }),
  tx({ date: '2026-09-25', amount: 2_000, direction: 'out', merchant: 'KART ODEME', category_id: 'tr', account_id: 'vadesiz' }),
]

describe('dönem', () => {
  it('kart modu ekstre dönemini, takvim modu ayı kullanır', () => {
    const card = accountPeriods({ month: '2026-09', mode: 'card' }, ACCOUNTS, STATEMENTS)
    expect(card.get('card')).toEqual({ start: '2026-08-21', end: '2026-09-20', statementId: 's1' })
    expect(card.get('vadesiz')).toMatchObject({ start: '2026-09-01', end: '2026-09-30' })
    // Ekstre yoksa kesim gününden türetilir
    const oct = accountPeriods({ month: '2026-10', mode: 'card' }, ACCOUNTS, STATEMENTS)
    expect(oct.get('card')).toMatchObject({ start: '2026-09-21', end: '2026-10-20', statementId: null })
  })

  it('takvim ayı özeti: gelir, gider, transfer hariç, kırılımlar', () => {
    const s = summarizePeriod(TXNS, CATS, ACCOUNTS, STATEMENTS, { month: '2026-09', mode: 'month' })
    expect(s.income).toBe(90_000)
    expect(s.expense).toBe(300 + 200 + 900 + 50 + 28_000)
    expect(s.split).toEqual({ fixed: 28_000, installments: 900, bankCosts: 50, variable: 500 })
    expect(s.topMerchants[0].merchant).toBe('KIRA')
    expect(s.topMerchants.find(m => m.merchant === 'MIGROS')!.amount).toBe(300)
    expect(s.byAccount.find(a => a.account.id === 'card')!.spend).toBe(1_450)
    expect(s.byAccount.find(a => a.account.id === 'card')!.topCategories[0]).toEqual({ name: 'Market', amount: 1_400 })
    expect(s.biggest[0].amount).toBe(28_000)
  })

  it('kart dönemi özeti kart harcamalarını kesim aralığına göre toplar', () => {
    const s = summarizePeriod(TXNS, CATS, ACCOUNTS, STATEMENTS, { month: '2026-09', mode: 'card' })
    const card = s.byAccount.find(a => a.account.id === 'card')!
    expect(card.spend).toBe(500 + 300 + 900 + 50)
    expect(s.topMerchants.find(m => m.merchant === 'MIGROS')!.amount).toBe(800)
    expect(s.topMerchants.some(m => m.merchant === 'A101')).toBe(false)
  })
})
