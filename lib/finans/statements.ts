import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ParsedLoanSchedule } from './ai/schemas'
import { learnBankRules, type BankRule } from './bankRules'
import { detectBank } from './banks'
import { todayISO } from './calc/dates'
import { toTRY } from './calc/networth'
import { getRates } from './fx'
import { dedupeKeys, maskSensitive, normalizeMerchant, rulePattern } from './merchant'
import { reconcile } from './reconcile'
import { sha256 } from './server'
import { TX_TYPES } from './txTypes'
import type { Account, DraftLoanSchedule, DraftStatement } from './types'

// Okunan ekstreyi mevcut hesaplardan biriyle eşleştirir: son 4 hane > aynı banka + tür
export function guessAccount(accounts: Account[], meta: DraftStatement['meta']): Account | null {
  if (meta.last4) {
    const byLast4 = accounts.find(a => a.last4 === meta.last4 && (a.type === meta.account_type || (a.type === 'kmh') === (meta.account_type === 'kmh')))
    if (byLast4) return byLast4
  }
  if (!meta.bank_id) return null
  const sameBank = accounts.filter(a => a.type === meta.account_type && detectBank(a.bank, a.name)?.id === meta.bank_id)
  return sameBank.length === 1 ? sameBank[0] : null
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

// Daha önce kaydedilmiş işlemleri işaretler (aynı ekstre ya da çakışan dönem tekrar yüklenirse)
export async function markDuplicates(supabase: SupabaseClient, draft: DraftStatement, accountId: string | null): Promise<DraftStatement> {
  if (!accountId) return draft
  const keys = dedupeKeys(accountId, draft.transactions)
  const existing = await existingHashes(supabase, keys)
  return {
    ...draft,
    transactions: draft.transactions.map((t, i) => (existing.has(sha256(keys[i])) ? { ...t, duplicate: true, include: false } : t)),
  }
}

export async function loadBankRules(supabase: SupabaseClient): Promise<BankRule[]> {
  const { data } = await supabase.from('fin_bank_rules').select('id, bank, pattern, kind, value')
  return (data ?? []) as BankRule[]
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
  bank_id: z.string().max(40).nullable(),
  learn_exclusions: z.boolean().default(false),
  meta: z.object({
    period_start: nullableDate,
    period_end: nullableDate,
    due_date: nullableDate,
    previous_balance: nullableNum,
    total_debt: nullableNum,
    min_payment: nullableNum,
    opening_balance: nullableNum,
    closing_balance: nullableNum,
    payments_total: nullableNum,
    purchases_total: nullableNum,
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
        ai_direction: z.enum(['in', 'out']),
        type: z.enum(TX_TYPES),
        currency: z.string().length(3),
        category_id: z.string().uuid().nullable(),
        ai_category_id: z.string().uuid().nullable(),
        installment_no: z.number().int().nullable(),
        installment_total: z.number().int().nullable(),
        flags: z.array(z.string().max(40)).max(20),
        duplicate: z.boolean(),
        include: z.boolean(),
      }),
    )
    .max(5000),
})

export interface ConfirmResult {
  inserted: number
  skipped: number
  learnedCategories: number
  learnedBankRules: number
  accountId: string
}

export async function confirmStatement(
  supabase: SupabaseClient,
  statementId: string,
  input: z.infer<typeof ConfirmStatementInput>,
): Promise<ConfirmResult> {
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

  const { rates } = await getRates(supabase)
  // Anahtarlar taslaktaki gibi TÜM satırlardan üretilir; böylece aynı gün aynı tutarlı satırların sırası tutarlı kalır
  const keys = dedupeKeys(accountId, input.transactions)
  const rows = input.transactions.flatMap((t, i) => {
    if (!t.include) return []
    const amountTry = toTRY(t.amount, t.currency, rates)
    if (amountTry == null) throw new Error(`${t.currency} kuru bulunamadı; Ayarlar’dan kuru girin.`)
    return [
      {
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
        tx_type: t.type,
        source: 'statement',
        dedupe_hash: sha256(keys[i]),
      },
    ]
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

  // Kullanıcının AI'dan farklı seçtiği kategoriler işyeri kuralı olarak öğrenilir
  const learnedRules = new Map<string, string>()
  for (const t of input.transactions) {
    if (t.include && t.category_id && t.category_id !== t.ai_category_id) learnedRules.set(rulePattern(t.merchant), t.category_id)
  }
  if (learnedRules.size) {
    const { error } = await supabase
      .from('fin_merchant_rules')
      .upsert([...learnedRules].map(([pattern, category_id]) => ({ pattern, category_id })), { onConflict: 'user_id,pattern' })
    if (error) throw new Error(error.message)
  }

  // Yön düzeltmeleri (ve istenirse hariç tutmalar) banka kuralı olarak öğrenilir
  const bankRules = learnBankRules(input.bank_id, input.transactions, input.learn_exclusions)
  if (bankRules.length) {
    const { error } = await supabase.from('fin_bank_rules').upsert(bankRules, { onConflict: 'user_id,bank,kind,pattern' })
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
      // KMH'de borç pozitif tutulur; vadesizde eksi bakiye KMH kullanımıdır
      accountUpdate.balance = account.type === 'kmh' ? Math.max(0, -balance) : balance
      accountUpdate.balance_updated_at = new Date().toISOString()
    }
  }
  if (input.meta.credit_limit != null && account.credit_limit == null) accountUpdate.credit_limit = input.meta.credit_limit
  if (input.meta.due_date && !account.due_day) accountUpdate.due_day = Number(input.meta.due_date.slice(8, 10))
  if (input.meta.period_end && !account.statement_day) accountUpdate.statement_day = Number(input.meta.period_end.slice(8, 10))
  if (input.bank_id && !account.bank) accountUpdate.bank = detectBankName(input.bank_id)
  if (Object.keys(accountUpdate).length) await supabase.from('fin_accounts').update(accountUpdate).eq('id', accountId)

  const final = reconcile({ account_type: account.type, ...input.meta }, input.transactions)
  const { error: stErr } = await supabase
    .from('fin_statements')
    .update({
      account_id: accountId,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      bank: input.bank_id ? detectBankName(input.bank_id) : null,
      period_start: input.meta.period_start,
      period_end: input.meta.period_end,
      due_date: input.meta.due_date,
      previous_balance: input.meta.previous_balance,
      total_debt: input.meta.total_debt,
      min_payment: input.meta.min_payment,
      opening_balance: input.meta.opening_balance,
      closing_balance: input.meta.closing_balance,
      reconcile_status: final.status,
      reconcile_diff: final.diff,
    })
    .eq('id', statementId)
  if (stErr) throw new Error(stErr.message)

  return { inserted, skipped: rows.length - inserted, learnedCategories: learnedRules.size, learnedBankRules: bankRules.length, accountId }
}

function detectBankName(id: string): string {
  return detectBank(id)?.name ?? id
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
