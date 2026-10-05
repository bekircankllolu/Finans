'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getFinanceUser, sha256 } from '@/lib/finans/server'
import { buildSchedule } from '@/lib/finans/calc/loans'
import { todayISO } from '@/lib/finans/calc/dates'
import { dedupeKeys, normalizeMerchant, rulePattern } from '@/lib/finans/merchant'
import { getRates, refreshRates as refreshLiveRates } from '@/lib/finans/fx'
import { toTRY } from '@/lib/finans/calc/networth'

type Result = { ok: true } | { ok: false; error: string }

async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await fn()
    revalidatePath('/finans', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof z.ZodError ? 'Geçersiz form verisi' : err instanceof Error ? err.message : 'Hata' }
  }
}

function check<T = unknown>(res: { error: { message: string } | null; data?: unknown }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const id = z.string().uuid()
const money = z.coerce.number().finite()
const optMoney = z.union([money, z.null()]).optional()
const optDay = z.union([z.coerce.number().int().min(1).max(31), z.null()]).optional()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// ─── Hesaplar ────────────────────────────────────────────────
const AccountInput = z.object({
  id: id.optional(),
  type: z.enum(['credit_card', 'checking', 'kmh', 'savings', 'investment', 'cash']),
  bank: z.string().max(80).nullable().optional(),
  name: z.string().min(1).max(80),
  currency: z.string().length(3).default('TRY'),
  last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  credit_limit: optMoney,
  balance: money.default(0),
  statement_day: optDay,
  due_day: optDay,
  monthly_rate: optMoney,
  is_active: z.boolean().default(true),
})

export async function saveAccount(input: z.input<typeof AccountInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const { id: accountId, ...row } = AccountInput.parse(input)
    const payload = { ...row, balance_updated_at: new Date().toISOString() }
    check(accountId ? await supabase.from('fin_accounts').update(payload).eq('id', accountId) : await supabase.from('fin_accounts').insert(payload))
  })
}

export async function deleteAccount(accountId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_accounts').delete().eq('id', id.parse(accountId)))
  })
}

// ─── Kategoriler & kurallar ──────────────────────────────────
const CategoryInput = z.object({
  id: id.optional(),
  name: z.string().min(1).max(60),
  kind: z.enum(['expense', 'income', 'transfer']),
  is_fixed: z.boolean().default(false),
})

export async function saveCategory(input: z.input<typeof CategoryInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const { id: catId, ...row } = CategoryInput.parse(input)
    check(catId ? await supabase.from('fin_categories').update(row).eq('id', catId) : await supabase.from('fin_categories').insert({ ...row, sort: 100 }))
  })
}

export async function deleteCategory(catId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_categories').delete().eq('id', id.parse(catId)))
  })
}

export async function deleteRule(ruleId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_merchant_rules').delete().eq('id', id.parse(ruleId)))
  })
}

// ─── İşlemler ────────────────────────────────────────────────
// Kategori değişikliği istenirse aynı işyerinin tüm işlemlerine uygulanır ve kural olarak öğrenilir.
export async function setTransactionCategory(input: { ids: string[]; categoryId: string | null; learn: boolean }) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const ids = z.array(id).min(1).max(500).parse(input.ids)
    const categoryId = input.categoryId ? id.parse(input.categoryId) : null
    check(await supabase.from('fin_transactions').update({ category_id: categoryId }).in('id', ids))
    if (input.learn && categoryId) {
      const rows = check<{ merchant: string }[]>(await supabase.from('fin_transactions').select('merchant').in('id', ids))
      const merchants = [...new Set(rows.map(r => r.merchant))]
      check(
        await supabase
          .from('fin_merchant_rules')
          .upsert(merchants.map(m => ({ pattern: rulePattern(m), category_id: categoryId })), { onConflict: 'user_id,pattern' }),
      )
      check(await supabase.from('fin_transactions').update({ category_id: categoryId }).in('merchant', merchants))
    }
  })
}

const ManualTxInput = z.object({
  account_id: id.nullable(),
  date,
  description: z.string().min(1).max(200),
  amount: money.positive(),
  direction: z.enum(['in', 'out']),
  currency: z.string().length(3).default('TRY'),
  category_id: id.nullable(),
  notes: z.string().max(500).nullable().optional(),
})

export async function addManualTransaction(input: z.input<typeof ManualTxInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const tx = ManualTxInput.parse(input)
    const { rates } = await getRates(supabase)
    const amountTry = toTRY(tx.amount, tx.currency, rates)
    if (amountTry == null) throw new Error(`${tx.currency} kuru bulunamadı`)
    const [key] = dedupeKeys(tx.account_id ?? 'manual', [tx])
    check(
      await supabase.from('fin_transactions').insert({
        ...tx,
        merchant: normalizeMerchant(tx.description),
        amount_try: amountTry,
        source: 'manual',
        dedupe_hash: sha256(`${key}|manual|${Date.now()}`),
      }),
    )
  })
}

export async function deleteTransactions(ids: string[]) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_transactions').delete().in('id', z.array(id).min(1).max(500).parse(ids)))
  })
}

// ─── Krediler ────────────────────────────────────────────────
const LoanInput = z.object({
  name: z.string().min(1).max(80),
  bank: z.string().max(80).nullable().optional(),
  principal: money.positive(),
  monthly_rate: money.min(0).max(20),
  term_months: z.coerce.number().int().min(1).max(360),
  first_due_date: date,
  include_taxes: z.boolean().default(true),
})

export async function createLoan(input: z.input<typeof LoanInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const loan = LoanInput.parse(input)
    const created = check<{ id: string }>(await supabase.from('fin_loans').insert(loan).select('id').single())
    const rows = buildSchedule(
      {
        principal: loan.principal,
        monthlyRatePct: loan.monthly_rate,
        termMonths: loan.term_months,
        firstDueDate: loan.first_due_date,
        includeTaxes: loan.include_taxes,
      },
      todayISO(),
    )
    check(await supabase.from('fin_loan_installments').insert(rows.map(r => ({ ...r, loan_id: created.id }))))
  })
}

export async function deleteLoan(loanId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_loans').delete().eq('id', id.parse(loanId)))
  })
}

export async function setInstallmentPaid(input: { loanId: string; upToNo: number; paid: boolean }) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const loanId = id.parse(input.loanId)
    const no = z.number().int().min(1).parse(input.upToNo)
    // "Bu taksite kadar ödendi" ya da "bu taksitten itibaren ödenmedi"
    const q = supabase.from('fin_loan_installments').update({ paid: input.paid }).eq('loan_id', loanId)
    check(input.paid ? await q.lte('no', no) : await q.gte('no', no))
  })
}

// ─── Gelir kaynakları ────────────────────────────────────────
const IncomeInput = z.object({
  id: id.optional(),
  name: z.string().min(1).max(80),
  kind: z.enum(['salary', 'freelance', 'rent', 'other']),
  amount: money.positive(),
  currency: z.string().length(3).default('TRY'),
  day_of_month: optDay,
  is_recurring: z.boolean().default(true),
  is_active: z.boolean().default(true),
})

export async function saveIncome(input: z.input<typeof IncomeInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const { id: incomeId, ...row } = IncomeInput.parse(input)
    check(incomeId ? await supabase.from('fin_income_sources').update(row).eq('id', incomeId) : await supabase.from('fin_income_sources').insert(row))
  })
}

export async function deleteIncome(incomeId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_income_sources').delete().eq('id', id.parse(incomeId)))
  })
}

// ─── Varlıklar & kur ─────────────────────────────────────────
const HoldingInput = z.object({
  id: id.optional(),
  name: z.string().min(1).max(80),
  asset: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'XAU', 'FUND', 'BES', 'STOCK', 'OTHER']),
  quantity: money.min(0),
  unit_price_try: optMoney,
})

export async function saveHolding(input: z.input<typeof HoldingInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const { id: holdingId, ...row } = HoldingInput.parse(input)
    const payload = { ...row, updated_at: new Date().toISOString() }
    check(holdingId ? await supabase.from('fin_holdings').update(payload).eq('id', holdingId) : await supabase.from('fin_holdings').insert(payload))
  })
}

export async function deleteHolding(holdingId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_holdings').delete().eq('id', id.parse(holdingId)))
  })
}

export async function refreshRates() {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    await refreshLiveRates(supabase)
  })
}

// Canlı kur alınamazsa elle girilir
export async function setManualRate(input: { code: string; rate: number }) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const code = z.enum(['USD', 'EUR', 'GBP', 'XAU']).parse(input.code)
    const rate = money.positive().parse(input.rate)
    check(await supabase.from('fin_fx_rates').upsert({ code, rate_try: rate, updated_at: new Date().toISOString() }))
  })
}

// ─── Bütçe & hedefler ────────────────────────────────────────
export async function saveBudget(input: { categoryId: string; monthlyLimit: number | null }) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const categoryId = id.parse(input.categoryId)
    if (!input.monthlyLimit) {
      check(await supabase.from('fin_budgets').delete().eq('category_id', categoryId))
      return
    }
    check(
      await supabase
        .from('fin_budgets')
        .upsert({ category_id: categoryId, monthly_limit: money.positive().parse(input.monthlyLimit) }, { onConflict: 'user_id,category_id' }),
    )
  })
}

const GoalInput = z.object({
  id: id.optional(),
  name: z.string().min(1).max(80),
  target_amount: money.positive(),
  current_amount: money.min(0).default(0),
  target_date: date.nullable().optional(),
})

export async function saveGoal(input: z.input<typeof GoalInput>) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const { id: goalId, ...row } = GoalInput.parse(input)
    check(goalId ? await supabase.from('fin_goals').update(row).eq('id', goalId) : await supabase.from('fin_goals').insert(row))
  })
}

export async function deleteGoal(goalId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_goals').delete().eq('id', id.parse(goalId)))
  })
}

// ─── Uyarılar & ekstreler ────────────────────────────────────
export async function dismissAlert(key: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_alert_dismissals').upsert({ key: z.string().max(200).parse(key) }, { onConflict: 'user_id,key' }))
  })
}

export async function deleteStatement(input: { statementId: string; withTransactions: boolean }) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    const statementId = id.parse(input.statementId)
    const st = check<{ file_path: string; extra_paths: string[] | null }>(
      await supabase.from('fin_statements').select('file_path, extra_paths').eq('id', statementId).single(),
    )
    if (input.withTransactions) check(await supabase.from('fin_transactions').delete().eq('statement_id', statementId))
    await supabase.storage.from('fin-statements').remove([st.file_path, ...(st.extra_paths ?? [])])
    check(await supabase.from('fin_statements').delete().eq('id', statementId))
  })
}

export async function clearChat() {
  return run(async () => {
    const { supabase, user } = await getFinanceUser()
    check(await supabase.from('fin_chat_messages').delete().eq('user_id', user.id))
  })
}

export async function deleteBankRule(ruleId: string) {
  return run(async () => {
    const { supabase } = await getFinanceUser()
    check(await supabase.from('fin_bank_rules').delete().eq('id', id.parse(ruleId)))
  })
}
