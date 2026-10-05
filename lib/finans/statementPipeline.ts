import type { ParsedStatement, ParsedTransaction, VerifyResult } from './ai/schemas'
import { applyBankRules, type BankRule } from './bankRules'
import { detectBank } from './banks'
import { diffDays } from './calc/dates'
import { dictionaryCategory } from './merchants-tr'
import { maskSensitive, matchRule, normalizeMerchant, type MerchantRule } from './merchant'
import { explainDiff, reconcile, type Reconciliation } from './reconcile'
import { categoryForType } from './txTypes'
import type { Category, CategorySource, DraftStatement, DraftTransaction } from './types'

// Ekstre okuma hattı (AI çağrıları dışarıdan verilir, böylece testte sahte extractor kullanılır):
//  1) AI çıkarımı  2) banka tanıma  3) kurallar + kategori  4) toplam kontrolü
//  5) tutmazsa AI kontrol turu → düzeltmeleri uygula → tekrar kontrol

export interface PipelineContext {
  categories: Category[]
  userRules: MerchantRule[]
  bankRules: BankRule[]
  hasLoans: boolean
}

export type ProgressStep = 'reading' | 'bank' | 'extracted' | 'reconciled' | 'verifying' | 'verified' | 'categorized'
export type Progress = (step: ProgressStep, message: string) => void

const r2 = (n: number) => Math.round(n * 100) / 100

function pickCategory(
  t: ParsedTransaction,
  merchant: string,
  ctx: PipelineContext,
  catByName: Map<string, string>,
): { id: string | null; ai: string | null; source: CategorySource } {
  const ai = catByName.get(t.category) ?? null
  const rule = matchRule(merchant, ctx.userRules)
  if (rule) return { id: rule, ai, source: 'rule' }
  const byType = categoryForType(t.type, t.description)
  if (byType && catByName.has(byType)) return { id: catByName.get(byType)!, ai, source: 'type' }
  const dict = dictionaryCategory(merchant, t.description)
  if (dict && catByName.has(dict) && (t.direction === 'out' || t.type === 'refund')) return { id: catByName.get(dict)!, ai, source: 'dictionary' }
  return { id: ai, ai, source: ai ? 'ai' : null }
}

function toDraftRows(parsed: ParsedStatement, ctx: PipelineContext, bankId: string | null, flagsByIndex?: Map<number, string[]>): DraftTransaction[] {
  const catByName = new Map(ctx.categories.map(c => [c.name, c.id]))
  const start = parsed.period_start
  const end = parsed.period_end
  const rows: DraftTransaction[] = parsed.transactions.map((t, i) => {
    const merchant = normalizeMerchant(t.merchant || t.description)
    const cat = pickCategory(t, merchant, ctx, catByName)
    const flags = [...(flagsByIndex?.get(i) ?? [])]
    if (t.confidence === 'low') flags.push('low_confidence')
    // Dönem sonundan 5 günden sonra veya dönem başından 40 gün önce olan tarih büyük ihtimalle yanlış yıl/ay
    const afterEnd = end ? diffDays(end, t.date) > 5 : false
    const beforeStart = start ? diffDays(t.date, start) > 40 : end ? diffDays(t.date, end) > 75 : false
    if (afterEnd || beforeStart) flags.push('date_outside_period')
    return {
      tempId: `t${i}`,
      date: t.date,
      description: maskSensitive(t.description),
      merchant,
      amount: r2(Math.abs(t.amount)),
      direction: t.direction,
      ai_direction: t.direction,
      type: t.type,
      currency: t.currency || parsed.currency || 'TRY',
      original_amount: t.original_amount,
      original_currency: t.original_currency,
      category_id: cat.id,
      ai_category_id: cat.ai,
      category_source: cat.source,
      installment_no: t.installment_no,
      installment_total: t.installment_total,
      confidence: t.confidence,
      page: t.page,
      flags,
      duplicate: false,
      include: true,
    }
  })
  return applyBankRules(rows, ctx.bankRules, bankId)
}

function reconcileDraft(meta: DraftStatement['meta'], rows: DraftTransaction[]): Reconciliation {
  return reconcile(meta, rows)
}

export function describeDiscrepancy(rec: Reconciliation): string {
  const failed = rec.checks.filter(c => !c.ok)
  if (!failed.length) return ''
  return failed
    .map(c => `${c.label}: ekstrede ${c.expected.toLocaleString('tr-TR')} TL, okunan satırlardan hesaplanan ${c.actual.toLocaleString('tr-TR')} TL (fark ${c.diff.toLocaleString('tr-TR')} TL)`)
    .join('; ')
}

function suggestionsFor(parsed: ParsedStatement, rows: DraftTransaction[], ctx: PipelineContext): string[] {
  const out: string[] = []
  if (parsed.account_type !== 'credit_card' && parsed.account_type !== 'kmh' && (parsed.closing_balance ?? 0) < 0) {
    out.push('Hesap eksi bakiyede görünüyor: KMH (kredili mevduat) kullanılıyor olabilir. Hesap türünü "KMH" seçmen borç hesaplarını doğru yapar.')
  }
  if (!ctx.hasLoans && rows.some(r => r.type === 'loan_payment' && r.include)) {
    out.push('Kredi taksiti ödemesi var ama tanımlı kredin yok. Borçlar sayfasından krediyi eklersen kalan taksitler ve faiz takip edilir.')
  }
  if (rows.some(r => r.type === 'cash_advance' && r.include)) {
    out.push('Nakit avans kullanılmış: nakit avansa çekildiği günden itibaren faiz işler, ilk fırsatta kapatmak gerekir.')
  }
  return out
}

export function buildDraft(parsed: ParsedStatement, ctx: PipelineContext, extra?: Partial<Pick<DraftStatement, 'verification'>> & { flagsByIndex?: Map<number, string[]> }): DraftStatement {
  const bank = detectBank(parsed.bank, parsed.card_brand, parsed.account_name)
  const rows = toDraftRows(parsed, ctx, bank?.id ?? null, extra?.flagsByIndex)
  const meta: DraftStatement['meta'] = {
    bank: bank?.name ?? parsed.bank,
    bank_id: bank?.id ?? null,
    card_brand: parsed.card_brand,
    account_type: parsed.account_type,
    account_name: parsed.account_name,
    last4: parsed.last4?.replace(/\D/g, '').slice(-4) || null,
    currency: parsed.currency || 'TRY',
    period_start: parsed.period_start,
    period_end: parsed.period_end,
    due_date: parsed.due_date,
    previous_balance: parsed.previous_balance,
    total_debt: parsed.total_debt,
    min_payment: parsed.min_payment,
    opening_balance: parsed.opening_balance,
    closing_balance: parsed.closing_balance,
    payments_total: parsed.payments_total,
    purchases_total: parsed.purchases_total,
    credit_limit: parsed.credit_limit,
  }
  const reconciliation = reconcileDraft(meta, rows)
  const suspects = reconciliation.status === 'mismatch' ? explainDiff(reconciliation.diff, rows) : []
  const suspectIds = new Set(suspects.map(s => s.tempId))
  const warnings = [...parsed.warnings]
  if (rows.some(r => r.flags.includes('date_outside_period'))) warnings.push('Bazı satırların tarihi ekstre döneminin dışında; tarih/yıl doğru okunmuş mu kontrol et.')
  if (parsed.document_kind === 'other') warnings.push('Belge bir banka ekstresine benzemiyor; içeriği dikkatle kontrol et.')

  return {
    meta,
    transactions: rows.map(r => (suspectIds.has(r.tempId) ? { ...r, flags: [...r.flags, 'suspect'] } : r)),
    reconciliation,
    suspects,
    verification: extra?.verification ?? { ran: false, changes: 0, notes: null, diffBefore: null },
    warnings,
    suggestions: suggestionsFor(parsed, rows, ctx),
  }
}

// AI kontrol turunun düzeltmelerini ham çıkarıma uygular. Hangi satırların eklendiği/değiştiği işaretlenir.
export function applyCorrections(parsed: ParsedStatement, v: VerifyResult): { parsed: ParsedStatement; changes: number; flagsByIndex: Map<number, string[]> } {
  const removed = new Set(v.remove.filter(i => i >= 0 && i < parsed.transactions.length))
  const updates = new Map(v.update.filter(u => u.index >= 0 && u.index < parsed.transactions.length).map(u => [u.index, u]))
  const kept: { t: ParsedTransaction; flag: string | null }[] = []
  parsed.transactions.forEach((t, i) => {
    if (removed.has(i)) return
    const u = updates.get(i)
    if (!u) return kept.push({ t, flag: null })
    kept.push({
      t: {
        ...t,
        date: u.date ?? t.date,
        amount: u.amount ?? t.amount,
        direction: u.direction ?? t.direction,
        type: u.type ?? t.type,
        description: u.description ?? t.description,
      },
      flag: 'verify_changed',
    })
  })
  for (const t of v.add) kept.push({ t, flag: 'verify_added' })
  kept.sort((a, b) => a.t.date.localeCompare(b.t.date))

  const flagsByIndex = new Map<number, string[]>()
  kept.forEach((k, i) => k.flag && flagsByIndex.set(i, [k.flag]))
  const m = v.meta
  return {
    parsed: {
      ...parsed,
      previous_balance: m.previous_balance ?? parsed.previous_balance,
      total_debt: m.total_debt ?? parsed.total_debt,
      opening_balance: m.opening_balance ?? parsed.opening_balance,
      closing_balance: m.closing_balance ?? parsed.closing_balance,
      transactions: kept.map(k => k.t),
    },
    changes: removed.size + updates.size + v.add.length + Object.values(m).filter(x => x != null).length,
    flagsByIndex,
  }
}

export interface PipelineDeps {
  extract: () => Promise<ParsedStatement>
  verify?: (parsed: ParsedStatement, discrepancy: string) => Promise<VerifyResult>
  onProgress?: Progress
}

export interface PipelineResult {
  parsed: ParsedStatement
  draft: DraftStatement
}

export async function runExtraction(deps: PipelineDeps, ctx: PipelineContext): Promise<PipelineResult> {
  const p = deps.onProgress ?? (() => undefined)
  p('reading', 'Belge okunuyor')
  const parsed = await deps.extract()
  const draft = buildDraft(parsed, ctx)
  p('bank', draft.meta.bank ? `Banka: ${draft.meta.bank}${draft.meta.card_brand ? ` · ${draft.meta.card_brand}` : ''}` : 'Banka belirlenemedi')
  p('extracted', `${draft.transactions.length} işlem okundu`)
  p('reconciled', reconcileMessage(draft.reconciliation))
  return { parsed, draft }
}

export async function runVerification(deps: PipelineDeps, ctx: PipelineContext, prev: PipelineResult): Promise<PipelineResult> {
  const p = deps.onProgress ?? (() => undefined)
  if (!deps.verify || prev.draft.reconciliation.status !== 'mismatch') return prev
  p('verifying', 'Toplamlar tutmadı, belge yeniden kontrol ediliyor')
  const result = await deps.verify(prev.parsed, describeDiscrepancy(prev.draft.reconciliation))
  const { parsed, changes, flagsByIndex } = applyCorrections(prev.parsed, result)
  const draft = buildDraft(parsed, ctx, {
    flagsByIndex,
    verification: { ran: true, changes, notes: result.notes || null, diffBefore: prev.draft.reconciliation.diff },
  })
  p('verified', `${changes} düzeltme · ${reconcileMessage(draft.reconciliation)}`)
  return { parsed, draft }
}

export function reconcileMessage(rec: Reconciliation): string {
  if (rec.status === 'ok') return 'Toplamlar ekstreyle tutuyor'
  if (rec.status === 'unknown') return 'Ekstrede kontrol edilecek toplam bulunamadı'
  return `Toplamlarda ${Math.abs(rec.diff).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL fark var`
}
