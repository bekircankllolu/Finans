import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ParsedLoanSchedule, ParsedStatement } from './ai/parseStatement'
import { todayISO } from './calc/dates'
import { toTRY } from './calc/networth'
import { getRates } from './fx'
import { dedupeKeys, maskSensitive, matchRule, normalizeMerchant, rulePattern, type MerchantRule } from './merchant'
import { sha256 } from './server'
import type { Account, Category, DraftLoanSchedule, DraftStatement } from './types'

export function guessAccount(accounts: Account[], meta: ParsedStatement): Account | null {
  if (meta.last4) {
    const byLast4 = accounts.find(a => a.last4 === meta.last4 && a.type === meta.account_type)
    if (byLast4) return byLast4
  }
  const sameType = accounts.filter(
    a => a.type === meta.account_type && meta.bank && a.bank?.toLocaleLowerCase('tr-TR') === meta.bank.toLocaleLowerCase('tr-TR'),
  )
  return sameType.length === 1 ? sameType[0] : null
}

export async function existingHashes(supabase: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const hashes = keys.map(sha256)
  const found = new Set<string>()
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await supabase.from('fin_transactions').select('dedupe_hash').in('dedupe_hash', hashes.slice(i, i + 200))
    for (const row of data ?? []) found.add(row.dedupe_hash)
  }
  return found
}

export async function buildStatementDraft(
  supabase: SupabaseClient,
  parsed: ParsedStatement,
  categories: Category[],
  rules: MerchantRule[],
  accountId: string | null,
): Promise<DraftStatement> {
  const catByName = new Map(categories.map(c => [c.name, c.id]))

  const base = parsed.transactions.map((t, i) => {
    const merchant = normalizeMerchant(t.merchant || t.description)
    const aiCategory = catByName.get(t.category) ?? null
    return {
      tempId: `t${i}`,
      date: t.date,
      description: maskSensitive(t.description),
      merchant,
      amount: Math.abs(t.amount),
      direction: t.direction,
      currency: t.currency || parsed.currency || 'TRY',
      // Öğrenilmiş kural AI tahmininden önce gelir
      category_id: matchRule(merchant, rules) ?? aiCategory,
      ai_category_id: aiCategory,
      installment_no: t.installment_no,
      installment_total: t.installment_total,
    }
  })

  // Onayda da aynı (maskelenmiş) alanlarla anahtar üretildiği için tekrar tespiti tutarlı kalır
  const keys = accountId ? dedupeKeys(accountId, base) : []
  const existing = accountId ? await existingHashes(supabase, keys) : new Set<string>()
  const transactions = base.map((t, i) => {
    const duplicate = accountId ? existing.has(sha256(keys[i])) : false
    return { ...t, duplicate, include: !duplicate }
  })

  const warnings = [...parsed.warnings]
  if (parsed.account_type === 'credit_card' && parsed.total_debt != null) {
    const out = transactions.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0)
    if (out > 0 && Math.abs(out - parsed.total_debt) / parsed.total_debt > 0.5) {
      warnings.push('İşlem toplamı dönem borcundan belirgin şekilde farklı; önceki dönemden devreden borç veya eksik satır olabilir.')
    }
  }

  return {
    meta: {
      bank: parsed.bank,
      account_type: parsed.account_type,
      account_name: parsed.account_name,
      last4: parsed.last4?.replace(/\D/g, '').slice(-4) || null,
      currency: parsed.currency || 'TRY',
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      due_date: parsed.due_date,
      total_debt: parsed.total_debt,
      min_payment: parsed.min_payment,
      closing_balance: parsed.closing_balance,
      credit_limit: parsed.credit_limit,
    },
    transactions,
    warnings,
  }
}

export function buildLoanDraft(parsed: ParsedLoanSchedule): DraftLoanSchedule {
  const today = todayISO()
  return {
    meta: {
      bank: parsed.bank,
      name: parsed.name,
      principal: parsed.principal,
      monthly_rate: parsed.monthly_rate,
      term_months: parsed.term_months ?? parsed.installments.length,
    },
    installments: parsed.installments
      .sort((a, b) => a.no - b.no)
      .map(i => ({ ...i, paid: i.due_date < today })),
    warnings: parsed.warnings,
  }
}

// ─── Onay ────────────────────────────────────────────────────
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
const nullableNum = z.number().finite().nullable()

export const ConfirmStatementInput = z.object({
  account_id: z.string().uuid().nullable(),
  new_account: z
    .object({
      type: z.enum(['credit_card', 'checking', 'kmh', 'savings', 'investment', 'cash']),
      bank: z.string().max(80).nullable(),
      name: z.string().min(1).max(80),
      last4: z.string().regex(/^\d{4}$/).nullable(),
      currency: z.string().length(3),
    })
    .nullable(),
  meta: z.object({
    period_start: nullableDate,
    period_end: nullableDate,
    due_date: nullableDate,
    total_debt: nullableNum,
    min_payment: nullableNum,
    closing_balance: nullableNum,
    credit_limit: nullableNum,
  }),
  transactions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(300),
        merchant: z.string().max(120),
        amount: z.number().finite().min(0),
        direction: z.enum(['in', 'out']),
        currency: z.string().length(3),
        category_id: z.string().uuid().nullable(),
        ai_category_id: z.string().uuid().nullable(),
        installment_no: z.number().int().nullable(),
        installment_total: z.number().int().nullable(),
        include: z.boolean(),
      }),
    )
    .max(5000),
})

export async function confirmStatement(
  supabase: SupabaseClient,
  statementId: string,
  input: z.infer<typeof ConfirmStatementInput>,
): Promise<{ inserted: number; skipped: number; learned: number }> {
  let accountId = input.account_id
  if (!accountId) {
    if (!input.new_account) throw new Error('Hesap seçin veya yeni hesap oluşturun')
    const { data, error } = await supabase
      .from('fin_accounts')
      .insert({ ...input.new_account, credit_limit: input.meta.credit_limit })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    accountId = data.id as string
  }

  const { data: account, error: accErr } = await supabase.from('fin_accounts').select('*').eq('id', accountId).single()
  if (accErr || !account) throw new Error('Hesap bulunamadı')

  const included = input.transactions.filter(t => t.include)
  const { rates } = await getRates(supabase)
  const keys = dedupeKeys(accountId, included)
  const rows = included.map((t, i) => {
    const amountTry = toTRY(t.amount, t.currency, rates)
    if (amountTry == null) throw new Error(`${t.currency} kuru bulunamadı; Ayarlar’dan kuru girin.`)
    return {
      account_id: accountId,
      statement_id: statementId,
      date: t.date,
      description: maskSensitive(t.description),
      merchant: t.merchant || normalizeMerchant(t.description),
      amount: t.amount,
      direction: t.direction,
      currency: t.currency,
      amount_try: Math.round(amountTry * 100) / 100,
      category_id: t.category_id,
      installment_no: t.installment_no,
      installment_total: t.installment_total,
      source: 'statement',
      dedupe_hash: sha256(keys[i]),
    }
  })

  let inserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from('fin_transactions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,dedupe_hash', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    inserted += data?.length ?? 0
  }

  // Kullanıcının AI'dan farklı seçtiği kategoriler kural olarak öğrenilir
  const learnedRules = new Map<string, string>()
  for (const t of included) {
    if (t.category_id && t.category_id !== t.ai_category_id) learnedRules.set(rulePattern(t.merchant), t.category_id)
  }
  if (learnedRules.size) {
    const { error } = await supabase
      .from('fin_merchant_rules')
      .upsert([...learnedRules].map(([pattern, category_id]) => ({ pattern, category_id })), { onConflict: 'user_id,pattern' })
    if (error) throw new Error(error.message)
  }

  // Bakiye sadece en güncel ekstreden güncellenir (eski ekstre yüklemek bakiyeyi geri almasın)
  const { data: newer } = await supabase
    .from('fin_statements')
    .select('id')
    .eq('account_id', accountId)
    .eq('status', 'confirmed')
    .gt('period_end', input.meta.period_end ?? '0000-00-00')
    .limit(1)
  const isLatest = !newer?.length
  const accountUpdate: Record<string, unknown> = {}
  if (isLatest) {
    const balance = account.type === 'credit_card' ? input.meta.total_debt : input.meta.closing_balance
    if (balance != null) {
      accountUpdate.balance = account.type === 'kmh' ? Math.abs(balance) : balance
      accountUpdate.balance_updated_at = new Date().toISOString()
    }
  }
  if (input.meta.credit_limit != null && account.credit_limit == null) accountUpdate.credit_limit = input.meta.credit_limit
  if (input.meta.due_date && !account.due_day) accountUpdate.due_day = Number(input.meta.due_date.slice(8, 10))
  if (input.meta.period_end && !account.statement_day) accountUpdate.statement_day = Number(input.meta.period_end.slice(8, 10))
  if (Object.keys(accountUpdate).length) await supabase.from('fin_accounts').update(accountUpdate).eq('id', accountId)

  const { error: stErr } = await supabase
    .from('fin_statements')
    .update({
      account_id: accountId,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      period_start: input.meta.period_start,
      period_end: input.meta.period_end,
      due_date: input.meta.due_date,
      total_debt: input.meta.total_debt,
      min_payment: input.meta.min_payment,
      closing_balance: input.meta.closing_balance,
    })
    .eq('id', statementId)
  if (stErr) throw new Error(stErr.message)

  return { inserted, skipped: rows.length - inserted, learned: learnedRules.size }
}

export const ConfirmLoanInput = z.object({
  loan: z.object({
    name: z.string().min(1).max(80),
    bank: z.string().max(80).nullable(),
    principal: z.number().positive(),
    monthly_rate: z.number().min(0).max(20),
    include_taxes: z.boolean(),
  }),
  installments: z
    .array(
      z.object({
        no: z.number().int().min(1),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        principal: z.number(),
        interest: z.number(),
        tax: z.number(),
        total: z.number(),
        remaining_principal: z.number(),
        paid: z.boolean(),
      }),
    )
    .min(1)
    .max(400),
})

export async function confirmLoanSchedule(supabase: SupabaseClient, statementId: string, input: z.infer<typeof ConfirmLoanInput>) {
  const sorted = [...input.installments].sort((a, b) => a.no - b.no)
  const { data: loan, error } = await supabase
    .from('fin_loans')
    .insert({ ...input.loan, term_months: sorted.length, first_due_date: sorted[0].due_date })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const { error: instErr } = await supabase.from('fin_loan_installments').insert(sorted.map(i => ({ ...i, loan_id: loan.id })))
  if (instErr) throw new Error(instErr.message)
  await supabase.from('fin_statements').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', statementId)
  return { loanId: loan.id as string }
}
