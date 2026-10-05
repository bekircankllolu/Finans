import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractStatement, filesToContent, parseLoanSchedule, verifyStatement } from './ai/parseStatement'
import type { ParsedStatement } from './ai/schemas'
import { bankRulesForPrompt } from './bankRules'
import { detectBank } from './banks'
import { runExtraction, runVerification, type PipelineContext, type Progress } from './statementPipeline'
import { buildLoanDraft, guessAccount, loadBankRules, markDuplicates } from './statements'
import { ensureDefaults } from './server'
import type { Account, Category, DraftStatement } from './types'

// fin_statements.parsed içeriği (banka ekstresi için)
export interface StoredStatement {
  raw: ParsedStatement
  draft: DraftStatement
}

interface StatementRow {
  id: string
  kind: 'bank_statement' | 'loan_schedule'
  file_path: string
  extra_paths: string[] | null
  file_name: string
  mime_type: string
  account_id: string | null
  parsed: unknown
}

async function loadContext(supabase: SupabaseClient, userId: string) {
  await ensureDefaults(supabase, userId)
  const [{ data: categories }, { data: rules }, bankRules, { data: accounts }, { count: loanCount }] = await Promise.all([
    supabase.from('fin_categories').select('*').order('sort'),
    supabase.from('fin_merchant_rules').select('pattern, category_id'),
    loadBankRules(supabase),
    supabase.from('fin_accounts').select('*'),
    supabase.from('fin_loans').select('id', { count: 'exact', head: true }),
  ])
  const ctx: PipelineContext = {
    categories: (categories ?? []) as Category[],
    userRules: rules ?? [],
    bankRules,
    hasLoans: (loanCount ?? 0) > 0,
  }
  return { ctx, accounts: (accounts ?? []) as Account[] }
}

async function loadFiles(supabase: SupabaseClient, st: StatementRow) {
  const paths = [st.file_path, ...(st.extra_paths ?? [])]
  const files = await Promise.all(
    paths.map(async (path, i) => {
      const { data, error } = await supabase.storage.from('fin-statements').download(path)
      if (error || !data) throw new Error('Dosya indirilemedi')
      return { buffer: Buffer.from(await data.arrayBuffer()), mimeType: data.type || st.mime_type, fileName: i === 0 ? st.file_name : `${i + 1}. sayfa` }
    }),
  )
  return filesToContent(files)
}

export async function runParseJob(supabase: SupabaseClient, userId: string, st: StatementRow, onProgress: Progress) {
  const content = await loadFiles(supabase, st)

  if (st.kind === 'loan_schedule') {
    onProgress('reading', 'Kredi ödeme planı okunuyor')
    const draft = buildLoanDraft(await parseLoanSchedule(content))
    onProgress('extracted', `${draft.installments.length} taksit okundu`)
    return { status: 'parsed' as const, parsed: draft, accountId: null, needsVerify: false }
  }

  const { ctx, accounts } = await loadContext(supabase, userId)
  const preAccount = accounts.find(a => a.id === st.account_id) ?? null
  const preBank = preAccount ? detectBank(preAccount.bank, preAccount.name) : null
  const hints = preBank ? bankRulesForPrompt(ctx.bankRules.filter(r => r.bank === preBank.id)) : ''

  const result = await runExtraction(
    {
      extract: () => extractStatement(content, { categoryNames: ctx.categories.map(c => c.name), bankRuleHints: hints || undefined }),
      onProgress,
    },
    ctx,
  )

  // Belge aslında kredi ödeme planıysa türünü değiştir ve onu oku
  if (result.parsed.document_kind === 'loan_schedule') {
    onProgress('reading', 'Belge kredi ödeme planı olarak tanındı, plan okunuyor')
    const draft = buildLoanDraft(await parseLoanSchedule(content))
    await supabase.from('fin_statements').update({ kind: 'loan_schedule' }).eq('id', st.id)
    return { status: 'parsed' as const, parsed: draft, accountId: null, needsVerify: false }
  }

  const accountId = st.account_id ?? guessAccount(accounts, result.draft.meta)?.id ?? null
  const draft = await markDuplicates(supabase, result.draft, accountId)
  onProgress('categorized', `${draft.transactions.filter(t => t.duplicate).length} satır daha önce kaydedilmiş`)
  const stored: StoredStatement = { raw: result.parsed, draft }
  return { status: 'parsed' as const, parsed: stored, accountId, needsVerify: draft.reconciliation.status === 'mismatch' }
}

export async function runVerifyJob(supabase: SupabaseClient, userId: string, st: StatementRow, onProgress: Progress) {
  const stored = st.parsed as StoredStatement | null
  if (!stored?.raw || !stored.draft) throw new Error('Önce belge okunmalı')
  const content = await loadFiles(supabase, st)
  const { ctx } = await loadContext(supabase, userId)
  const categoryNames = ctx.categories.map(c => c.name)
  const result = await runVerification(
    { extract: async () => stored.raw, verify: (parsed, discrepancy) => verifyStatement(content, parsed, discrepancy, categoryNames), onProgress },
    ctx,
    { parsed: stored.raw, draft: stored.draft },
  )
  const draft = await markDuplicates(supabase, result.draft, st.account_id)
  return { parsed: { raw: result.parsed, draft } satisfies StoredStatement }
}
