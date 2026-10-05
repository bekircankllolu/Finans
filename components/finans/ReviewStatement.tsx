'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, CircleHelp, Lightbulb, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { monthKey, todayISO } from '@/lib/finans/calc/dates'
import { ACCOUNT_TYPE_LABELS } from '@/lib/finans/defaults'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import { normalizeMerchant } from '@/lib/finans/merchant'
import { reconcile } from '@/lib/finans/reconcile'
import { TX_TYPE_LABELS } from '@/lib/finans/txTypes'
import type { Account, AccountType, Category, DraftStatement, DraftTransaction } from '@/lib/finans/types'
import { cn } from '@/lib/utils'
import { DocumentViewer } from './DocumentViewer'
import { Stepper } from './Stepper'
import { Badge, buttonClass, Card, Field, inputClass } from './ui'

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))
const ATTENTION = ['low_confidence', 'suspect', 'date_outside_period', 'verify_added', 'verify_changed']

const FLAG_LABELS: Record<string, { label: string; tone: 'warning' | 'critical' | 'accent' | 'neutral' }> = {
  low_confidence: { label: 'emin değil', tone: 'warning' },
  suspect: { label: 'farkı açıklayabilir', tone: 'critical' },
  date_outside_period: { label: 'tarih dönem dışı', tone: 'warning' },
  verify_added: { label: 'kontrolde eklendi', tone: 'accent' },
  verify_changed: { label: 'kontrolde düzeltildi', tone: 'accent' },
  bank_rule_excluded: { label: 'banka kuralı: hariç', tone: 'neutral' },
  bank_rule_direction: { label: 'banka kuralı: yön', tone: 'neutral' },
  user_added: { label: 'elle eklendi', tone: 'neutral' },
}

type Filter = 'all' | 'attention' | 'uncategorized' | 'excluded' | 'duplicate'

interface ConfirmResult {
  inserted: number
  skipped: number
  learnedCategories: number
  learnedBankRules: number
}

export function ReviewStatement({
  statementId,
  mimeType,
  draft,
  accounts,
  categories,
  initialAccountId,
}: {
  statementId: string
  mimeType: string
  draft: DraftStatement
  accounts: Account[]
  categories: Category[]
  initialAccountId: string | null
}) {
  const [rows, setRows] = useState<DraftTransaction[]>(draft.transactions)
  const [meta, setMeta] = useState(draft.meta)
  const [accountId, setAccountId] = useState(initialAccountId ?? '')
  const [newAccount, setNewAccount] = useState({
    type: draft.meta.account_type as AccountType,
    bank: draft.meta.bank ?? '',
    name: draft.meta.account_name ?? [draft.meta.bank, draft.meta.card_brand ?? ACCOUNT_TYPE_LABELS[draft.meta.account_type]].filter(Boolean).join(' '),
    last4: draft.meta.last4 ?? '',
  })
  const [filter, setFilter] = useState<Filter>(draft.reconciliation.status === 'mismatch' ? 'attention' : 'all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCat, setBulkCat] = useState('')
  const [learnExclusions, setLearnExclusions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ConfirmResult | null>(null)

  const accountType = (accountId ? accounts.find(a => a.id === accountId)?.type : newAccount.type) ?? meta.account_type
  const isCard = accountType === 'credit_card'
  const catName = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories])
  const grouped = useMemo(
    () => ({
      expense: categories.filter(c => c.kind === 'expense'),
      income: categories.filter(c => c.kind === 'income'),
      transfer: categories.filter(c => c.kind === 'transfer'),
    }),
    [categories],
  )

  // Kullanıcı satırları düzenledikçe toplam kontrolü canlı yenilenir
  const rec = useMemo(() => reconcile({ ...meta, account_type: accountType }, rows), [meta, accountType, rows])
  const included = rows.filter(r => r.include)
  const excludedLearnable = rows.filter(r => !r.include && !r.duplicate && !r.flags.includes('bank_rule_excluded')).length
  const counts = {
    all: rows.length,
    attention: rows.filter(r => r.include && (r.flags.some(f => ATTENTION.includes(f)) || !r.category_id)).length,
    uncategorized: included.filter(r => !r.category_id).length,
    excluded: rows.filter(r => !r.include && !r.duplicate).length,
    duplicate: rows.filter(r => r.duplicate).length,
  }

  const visible = rows.filter(r => {
    if (filter === 'attention' && !(r.include && (r.flags.some(f => ATTENTION.includes(f)) || !r.category_id))) return false
    if (filter === 'uncategorized' && !(r.include && !r.category_id)) return false
    if (filter === 'excluded' && (r.include || r.duplicate)) return false
    if (filter === 'duplicate' && !r.duplicate) return false
    if (query) {
      const q = query.toLocaleLowerCase('tr-TR')
      if (!`${r.merchant} ${r.description}`.toLocaleLowerCase('tr-TR').includes(q)) return false
    }
    return true
  })

  const setRow = (tempId: string, patch: Partial<DraftTransaction>) => setRows(prev => prev.map(r => (r.tempId === tempId ? { ...r, ...patch } : r)))

  // Kategori değişince aynı işyerinin aynı kategorideki diğer satırları da güncellenir
  function setCategory(row: DraftTransaction, categoryId: string | null) {
    setRows(prev =>
      prev.map(r =>
        r.tempId === row.tempId || (r.merchant === row.merchant && r.category_id === row.category_id)
          ? { ...r, category_id: categoryId, category_source: 'user' }
          : r,
      ),
    )
  }

  function addRow() {
    const date = meta.period_end ?? todayISO()
    const row: DraftTransaction = {
      tempId: `u${Date.now()}`,
      date,
      description: '',
      merchant: '',
      amount: 0,
      direction: 'out',
      ai_direction: 'out',
      type: 'purchase',
      currency: meta.currency || 'TRY',
      original_amount: null,
      original_currency: null,
      category_id: null,
      ai_category_id: null,
      category_source: 'user',
      installment_no: null,
      installment_total: null,
      confidence: 'high',
      page: null,
      flags: ['user_added'],
      duplicate: false,
      include: true,
    }
    setRows(prev => [row, ...prev])
    setFilter('all')
  }

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      const bad = included.find(r => !(r.amount > 0) || !r.description.trim())
      if (bad) throw new Error('Eklenecek satırların açıklaması ve sıfırdan büyük tutarı olmalı.')
      const res = await fetch(`/api/finans/statements/${statementId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId || null,
          new_account: accountId
            ? null
            : { type: newAccount.type, bank: newAccount.bank || null, name: newAccount.name, last4: newAccount.last4 || null, currency: meta.currency || 'TRY' },
          bank_id: meta.bank_id,
          learn_exclusions: learnExclusions,
          meta: {
            period_start: meta.period_start,
            period_end: meta.period_end,
            due_date: meta.due_date,
            previous_balance: meta.previous_balance,
            total_debt: meta.total_debt,
            min_payment: meta.min_payment,
            opening_balance: meta.opening_balance,
            closing_balance: meta.closing_balance,
            payments_total: meta.payments_total,
            purchases_total: meta.purchases_total,
            credit_limit: meta.credit_limit,
          },
          transactions: rows.map(r => ({
            date: r.date,
            description: r.description,
            merchant: r.merchant || normalizeMerchant(r.description),
            amount: r.amount,
            direction: r.direction,
            ai_direction: r.ai_direction,
            type: r.type,
            currency: r.currency,
            category_id: r.category_id,
            ai_category_id: r.ai_category_id,
            installment_no: r.installment_no,
            installment_total: r.installment_total,
            flags: r.flags.slice(0, 20),
            duplicate: r.duplicate,
            include: r.include,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setResult(body)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    const byCat = new Map<string, number>()
    for (const r of included) if (r.direction === 'out') byCat.set(r.category_id ? catName.get(r.category_id) ?? '—' : 'Kategorisiz', (byCat.get(r.category_id ? catName.get(r.category_id) ?? '—' : 'Kategorisiz') ?? 0) + r.amount)
    const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const month = meta.period_end ? monthKey(meta.period_end) : null
    return (
      <>
        <Stepper current={3} />
        <Card className="max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="w-11 h-11 rounded-full bg-good-bg flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-good" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Ekstre kaydedildi</h2>
              <p className="text-sm text-muted mt-1">
                {meta.bank ?? 'Banka'} · {meta.period_end ? `dönem sonu ${formatDateTR(meta.period_end)}` : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {(
              [
                ['Eklenen işlem', result.inserted],
                ['Zaten kayıtlı', result.skipped + counts.duplicate],
                ['Öğrenilen kategori', result.learnedCategories],
                ['Öğrenilen banka kuralı', result.learnedBankRules],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <div className="text-xl font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-muted">{label}</div>
              </div>
            ))}
          </div>
          {top.length > 0 && (
            <div className="mt-6">
              <div className="text-xs text-muted mb-2">Bu ekstrede en çok harcanan kategoriler</div>
              <ul className="space-y-1.5">
                {top.map(([name, amount]) => (
                  <li key={name} className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="tabular-nums font-medium">{formatTRY(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-6">
            <Link href={month ? `/finans?ay=${month}${isCard ? '&mod=kart' : ''}` : '/finans'} className={buttonClass.primary}>
              Özete git
            </Link>
            <Link href={`/finans/islemler?ekstre=${statementId}`} className={buttonClass.ghost}>
              Bu ekstrenin işlemleri
            </Link>
            <Link href="/finans/yukle" className={buttonClass.ghost}>
              Sıradaki ekstreyi yükle
            </Link>
          </div>
        </Card>
      </>
    )
  }

  const recIcon = rec.status === 'ok' ? CheckCircle2 : rec.status === 'mismatch' ? AlertTriangle : CircleHelp
  const RecIcon = recIcon

  return (
    <>
      <Stepper current={2} />
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* Orijinal belge */}
        <Card padded={false} className="lg:col-span-5 lg:sticky lg:top-6 overflow-hidden h-[45vh] lg:h-[calc(100vh-7rem)]">
          <DocumentViewer statementId={statementId} mimeType={mimeType} />
        </Card>

        <div className="lg:col-span-7 space-y-4 min-w-0">
          {/* Toplam kontrolü */}
          <Card
            className={cn(rec.status === 'ok' && 'border-good/40', rec.status === 'mismatch' && 'border-warn/50')}
            title={
              <span className="flex items-center gap-2 text-ink">
                <RecIcon className={cn('w-5 h-5', rec.status === 'ok' ? 'text-good' : rec.status === 'mismatch' ? 'text-warn' : 'text-muted')} />
                {rec.status === 'ok' && 'Toplamlar ekstreyle tutuyor'}
                {rec.status === 'mismatch' && `Toplamlarda ${formatTRY(Math.abs(rec.diff), true)} fark var`}
                {rec.status === 'unknown' && 'Toplam kontrolü yapılamadı'}
              </span>
            }
            action={<span className="text-xs text-muted">{meta.bank ?? 'Banka belirlenemedi'}{meta.card_brand ? ` · ${meta.card_brand}` : ''}</span>}
          >
            {rec.checks.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {rec.checks.map(c => (
                  <li key={c.label} className="flex flex-wrap justify-between gap-x-4">
                    <span className="text-ink-2">{c.label}</span>
                    <span className="tabular-nums">
                      <span className="text-muted">ekstre</span> {formatTRY(c.expected, true)} · <span className="text-muted">okunan</span> {formatTRY(c.actual, true)}{' '}
                      {c.ok ? <span className="text-good">✓</span> : <span className="text-warn">({formatTRY(c.diff, true)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Ekstrede önceki borç/dönem borcu veya açılış/kapanış bakiyesi okunamadı. Aşağıdaki “Ekstre bilgileri”ne bu rakamları girersen kontrol çalışır.
              </p>
            )}
            {draft.verification.ran && (
              <div className="mt-3 flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
                <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>
                  İlk okumada {formatTRY(Math.abs(draft.verification.diffBefore ?? 0), true)} fark çıktı; AI belgeyi tekrar kontrol edip {draft.verification.changes} düzeltme yaptı.
                  {draft.verification.notes && <span className="block text-muted text-xs mt-0.5">{draft.verification.notes}</span>}
                </span>
              </div>
            )}
            {rec.status === 'mismatch' && (
              <p className="text-xs text-muted mt-3">
                “Dikkat” sekmesindeki satırları belgeyle karşılaştır: eksik satırı “Satır ekle” ile ekle, yanlış yönü <ArrowLeftRight className="inline w-3 h-3" /> ile çevir,
                işlem olmayan satırı kaldır. Kontrol canlı güncellenir.
              </p>
            )}
          </Card>

          {(draft.warnings.length > 0 || draft.suggestions.length > 0) && (
            <div className="space-y-2">
              {draft.warnings.map(w => (
                <div key={w} className="flex gap-2 rounded-xl border border-warn/30 bg-warn-bg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-label="Uyarı" />
                  <span>{w}</span>
                </div>
              ))}
              {draft.suggestions.map(s => (
                <div key={s} className="flex gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <Lightbulb className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-label="Öneri" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {/* Hesap ve ekstre bilgileri */}
          <Card title="Hesap ve ekstre bilgileri">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Bu ekstre hangi hesaba ait?">
                <select className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}>
                  <option value="">+ Yeni hesap oluştur</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.last4 ? `•${a.last4}` : ''} ({ACCOUNT_TYPE_LABELS[a.type]})
                    </option>
                  ))}
                </select>
              </Field>
              {!accountId && (
                <Field label="Hesap türü">
                  <select className={inputClass} value={newAccount.type} onChange={e => setNewAccount({ ...newAccount, type: e.target.value as AccountType })}>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {!accountId && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                <Field label="Hesap adı">
                  <input className={inputClass} value={newAccount.name} onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} />
                </Field>
                <Field label="Banka">
                  <input className={inputClass} value={newAccount.bank} onChange={e => setNewAccount({ ...newAccount, bank: e.target.value })} />
                </Field>
                <Field label="Son 4 hane">
                  <input className={inputClass} maxLength={4} inputMode="numeric" value={newAccount.last4} onChange={e => setNewAccount({ ...newAccount, last4: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
            )}
            <details className="mt-4 group" open={rec.status !== 'ok'}>
              <summary className="text-sm text-accent cursor-pointer select-none">Ekstre özet rakamları (AI’nın okuduğu, düzenlenebilir)</summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                <Field label="Dönem başı">
                  <input type="date" className={inputClass} value={meta.period_start ?? ''} onChange={e => setMeta({ ...meta, period_start: e.target.value || null })} />
                </Field>
                <Field label="Dönem sonu / kesim">
                  <input type="date" className={inputClass} value={meta.period_end ?? ''} onChange={e => setMeta({ ...meta, period_end: e.target.value || null })} />
                </Field>
                {isCard ? (
                  <>
                    <Field label="Son ödeme">
                      <input type="date" className={inputClass} value={meta.due_date ?? ''} onChange={e => setMeta({ ...meta, due_date: e.target.value || null })} />
                    </Field>
                    <NumField label="Önceki dönem borcu" value={meta.previous_balance} onChange={v => setMeta({ ...meta, previous_balance: v })} />
                    <NumField label="Dönem borcu" value={meta.total_debt} onChange={v => setMeta({ ...meta, total_debt: v })} />
                    <NumField label="Asgari ödeme" value={meta.min_payment} onChange={v => setMeta({ ...meta, min_payment: v })} />
                    <NumField label="Kart limiti" value={meta.credit_limit} onChange={v => setMeta({ ...meta, credit_limit: v })} />
                  </>
                ) : (
                  <>
                    <NumField label="Açılış bakiyesi" value={meta.opening_balance} onChange={v => setMeta({ ...meta, opening_balance: v })} />
                    <NumField label="Kapanış bakiyesi" value={meta.closing_balance} onChange={v => setMeta({ ...meta, closing_balance: v })} />
                  </>
                )}
              </div>
            </details>
          </Card>

          {/* İşlemler */}
          <Card padded={false}>
            <div className="p-4 border-b border-line space-y-3">
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {(
                  [
                    ['all', 'Tümü'],
                    ['attention', 'Dikkat'],
                    ['uncategorized', 'Kategorisiz'],
                    ['excluded', 'Hariç'],
                    ['duplicate', 'Zaten kayıtlı'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={cn('px-2.5 py-1.5 rounded-lg', filter === k ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-ink hover:bg-hover')}
                  >
                    {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
                  </button>
                ))}
                <button type="button" onClick={addRow} className={cn(buttonClass.subtle, 'ml-auto')}>
                  <Plus className="w-3.5 h-3.5" /> Satır ekle
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
                  <input className={cn(inputClass, 'pl-9 py-1.5')} placeholder="İşyeri ara…" value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                {selected.size > 0 && (
                  <div className="flex items-center gap-2">
                    <select className={cn(inputClass, 'py-1.5 w-44')} value={bulkCat} onChange={e => setBulkCat(e.target.value)} aria-label="Seçililere kategori">
                      <option value="">{selected.size} seçili → kategori</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!bulkCat}
                      className={buttonClass.primary}
                      onClick={() => {
                        setRows(prev => prev.map(r => (selected.has(r.tempId) ? { ...r, category_id: bulkCat, category_source: 'user' } : r)))
                        setSelected(new Set())
                        setBulkCat('')
                      }}
                    >
                      Uygula
                    </button>
                  </div>
                )}
              </div>
            </div>

            <ul className="divide-y divide-line">
              {visible.map(r => (
                <li
                  key={r.tempId}
                  className={cn('px-4 py-3 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-start', !r.include && 'opacity-50', r.flags.includes('suspect') && 'bg-warn-bg')}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[var(--accent)]"
                    checked={selected.has(r.tempId)}
                    aria-label="Seç"
                    onChange={() =>
                      setSelected(prev => {
                        const next = new Set(prev)
                        if (next.has(r.tempId)) next.delete(r.tempId)
                        else next.add(r.tempId)
                        return next
                      })
                    }
                  />
                  <div className="min-w-0">
                    {r.flags.includes('user_added') ? (
                      <input
                        className={cn(inputClass, 'py-1')}
                        placeholder="Açıklama / işyeri"
                        value={r.description}
                        onChange={e => setRow(r.tempId, { description: e.target.value, merchant: normalizeMerchant(e.target.value) })}
                      />
                    ) : (
                      <div className="text-sm font-medium truncate" title={r.description}>
                        {r.merchant || r.description}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-muted">
                      <input
                        type="date"
                        value={r.date}
                        onChange={e => e.target.value && setRow(r.tempId, { date: e.target.value })}
                        className="bg-transparent border-0 p-0 text-[11px] text-muted w-[92px]"
                        aria-label="Tarih"
                      />
                      <Badge>{TX_TYPE_LABELS[r.type]}</Badge>
                      {r.installment_total && r.installment_total > 1 && (
                        <Badge tone="accent">
                          {r.installment_no}/{r.installment_total} taksit
                        </Badge>
                      )}
                      {r.original_currency && (
                        <Badge>
                          {r.original_amount} {r.original_currency}
                        </Badge>
                      )}
                      {r.duplicate && <Badge tone="warning">zaten kayıtlı</Badge>}
                      {r.flags.map(f => FLAG_LABELS[f] && <Badge key={f} tone={FLAG_LABELS[f].tone}>{FLAG_LABELS[f].label}</Badge>)}
                      {r.page != null && <span className="text-faint">s.{r.page}</span>}
                    </div>
                    {!r.flags.includes('user_added') && r.description !== r.merchant && <div className="text-[11px] text-faint truncate mt-0.5">{r.description}</div>}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      title="Yönü çevir (giriş/çıkış)"
                      onClick={() => setRow(r.tempId, { direction: r.direction === 'out' ? 'in' : 'out' })}
                      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs', r.direction === 'in' ? 'bg-good-bg text-good' : 'bg-surface-2 text-ink-2')}
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      {r.direction === 'in' ? 'Giriş' : 'Çıkış'}
                    </button>
                    <AmountInput value={r.amount} onChange={v => setRow(r.tempId, { amount: v })} />
                    <select
                      className={cn(inputClass, 'py-1 w-44 text-xs', !r.category_id && r.include && 'border-warn')}
                      value={r.category_id ?? ''}
                      onChange={e => setCategory(r, e.target.value || null)}
                      aria-label="Kategori"
                    >
                      <option value="">— Kategorisiz —</option>
                      <optgroup label="Gider">
                        {grouped.expense.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Gelir">
                        {grouped.income.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Transfer (gelir/gider sayılmaz)">
                        {grouped.transfer.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {r.include ? (
                      <button type="button" className="p-1.5 rounded-md text-faint hover:text-crit hover:bg-crit-bg" title="Bu satırı ekleme" aria-label="Satırı hariç tut" onClick={() => setRow(r.tempId, { include: false })}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button type="button" className="text-xs text-accent px-1.5" onClick={() => setRow(r.tempId, { include: true })}>
                        Geri al
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {visible.length === 0 && <li className="p-6 text-sm text-muted text-center">Bu filtrede satır yok.</li>}
            </ul>
          </Card>
        </div>
      </div>

      {/* Onay çubuğu */}
      <div className="sticky bottom-20 lg:bottom-4 z-30 mt-5 rounded-2xl border border-line-strong bg-surface/95 backdrop-blur shadow-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 text-sm">
          <span className="font-medium">{included.length} işlem eklenecek</span>
          <span className="text-muted">
            {' '}
            · çıkış {formatTRY(rec.totals.out, true)} · giriş {formatTRY(rec.totals.in, true)}
          </span>
          {excludedLearnable > 0 && meta.bank_id && (
            <label className="flex items-center gap-2 text-xs text-muted mt-1.5">
              <input type="checkbox" className="accent-[var(--accent)]" checked={learnExclusions} onChange={e => setLearnExclusions(e.target.checked)} />
              Hariç tuttuğum {excludedLearnable} satır türünü {meta.bank} ekstrelerinde hep hariç tut
            </label>
          )}
        </div>
        {error && <span className="text-sm text-crit">{error}</span>}
        <button type="button" disabled={saving || (!accountId && !newAccount.name)} onClick={confirm} className={buttonClass.primary}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {rec.status === 'mismatch' ? 'Farka rağmen kaydet' : 'Onayla ve kaydet'}
        </button>
      </div>
    </>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','))
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        className={inputClass}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => onChange(numOrNull(text))}
      />
    </Field>
  )
}

function AmountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value ? value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
  return (
    <input
      inputMode="decimal"
      aria-label="Tutar"
      className={cn(inputClass, 'py-1 w-28 text-right tabular-nums text-sm')}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        const n = numOrNull(text) ?? 0
        onChange(Math.abs(n))
        setText(n ? Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
      }}
    />
  )
}
