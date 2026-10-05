'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ACCOUNT_TYPE_LABELS } from '@/lib/finans/defaults'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import type { Account, AccountType, Category, DraftStatement, DraftTransaction } from '@/lib/finans/types'
import { Badge, buttonClass, Card, Field, inputClass } from './ui'

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export function ReviewStatement({
  statementId,
  draft,
  accounts,
  categories,
  initialAccountId,
}: {
  statementId: string
  draft: DraftStatement
  accounts: Account[]
  categories: Category[]
  initialAccountId: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState<DraftTransaction[]>(draft.transactions)
  const [meta, setMeta] = useState(draft.meta)
  const [accountId, setAccountId] = useState<string>(initialAccountId ?? '')
  const [newAccount, setNewAccount] = useState({
    type: draft.meta.account_type as AccountType,
    bank: draft.meta.bank ?? '',
    name: draft.meta.account_name ?? [draft.meta.bank, ACCOUNT_TYPE_LABELS[draft.meta.account_type]].filter(Boolean).join(' '),
    last4: draft.meta.last4 ?? '',
  })
  const [filter, setFilter] = useState<'all' | 'uncategorized' | 'duplicate'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const grouped = useMemo(
    () => ({
      expense: categories.filter(c => c.kind === 'expense'),
      income: categories.filter(c => c.kind === 'income'),
      transfer: categories.filter(c => c.kind === 'transfer'),
    }),
    [categories],
  )

  const included = rows.filter(r => r.include)
  const totals = {
    out: included.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0),
    in: included.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0),
    duplicates: rows.filter(r => r.duplicate).length,
    uncategorized: included.filter(r => !r.category_id).length,
  }
  const visible = rows.filter(r => (filter === 'all' ? true : filter === 'duplicate' ? r.duplicate : !r.category_id && r.include))

  function setRow(tempId: string, patch: Partial<DraftTransaction>) {
    setRows(prev => prev.map(r => (r.tempId === tempId ? { ...r, ...patch } : r)))
  }

  // Kategori değişince aynı işyerinin aynı kategorideki diğer satırları da güncellenir
  function setCategory(row: DraftTransaction, categoryId: string | null) {
    setRows(prev =>
      prev.map(r =>
        r.tempId === row.tempId || (r.merchant === row.merchant && r.category_id === row.category_id) ? { ...r, category_id: categoryId } : r,
      ),
    )
  }

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/finans/statements/${statementId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId || null,
          new_account: accountId
            ? null
            : { type: newAccount.type, bank: newAccount.bank || null, name: newAccount.name, last4: newAccount.last4 || null, currency: meta.currency || 'TRY' },
          meta: {
            period_start: meta.period_start,
            period_end: meta.period_end,
            due_date: meta.due_date,
            total_debt: meta.total_debt,
            min_payment: meta.min_payment,
            closing_balance: meta.closing_balance,
            credit_limit: meta.credit_limit,
          },
          transactions: rows.map(r => ({
            date: r.date,
            description: r.description,
            merchant: r.merchant,
            amount: r.amount,
            direction: r.direction,
            currency: r.currency,
            category_id: r.category_id,
            ai_category_id: r.ai_category_id,
            installment_no: r.installment_no,
            installment_total: r.installment_total,
            include: r.include,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      router.push(`/finans/islemler?ok=${body.inserted}&skip=${body.skipped}&learned=${body.learned}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
      setSaving(false)
    }
  }

  const isCard = (accountId ? accounts.find(a => a.id === accountId)?.type : newAccount.type) === 'credit_card'

  return (
    <div className="space-y-4">
      {draft.warnings.length > 0 && (
        <div className="rounded-xl border border-[#fab219]/30 bg-[#fab219]/5 p-3 text-sm space-y-1">
          {draft.warnings.map(w => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-[#fab219] shrink-0 mt-0.5" aria-label="Uyarı" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Hesap">
          <div className="space-y-3">
            <Field label="Bu ekstre hangi hesaba ait?">
              <select className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">+ Yeni hesap oluştur</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.last4 ? `•${a.last4}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {!accountId && (
              <>
                <Field label="Tür">
                  <select className={inputClass} value={newAccount.type} onChange={e => setNewAccount({ ...newAccount, type: e.target.value as AccountType })}>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ad">
                  <input className={inputClass} value={newAccount.name} onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Banka">
                    <input className={inputClass} value={newAccount.bank} onChange={e => setNewAccount({ ...newAccount, bank: e.target.value })} />
                  </Field>
                  <Field label="Son 4 hane">
                    <input className={inputClass} maxLength={4} inputMode="numeric" value={newAccount.last4} onChange={e => setNewAccount({ ...newAccount, last4: e.target.value.replace(/\D/g, '') })} />
                  </Field>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card title="Ekstre bilgileri" className="lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Dönem başı">
              <input type="date" className={inputClass} value={meta.period_start ?? ''} onChange={e => setMeta({ ...meta, period_start: e.target.value || null })} />
            </Field>
            <Field label="Hesap kesim / dönem sonu">
              <input type="date" className={inputClass} value={meta.period_end ?? ''} onChange={e => setMeta({ ...meta, period_end: e.target.value || null })} />
            </Field>
            {isCard ? (
              <>
                <Field label="Son ödeme">
                  <input type="date" className={inputClass} value={meta.due_date ?? ''} onChange={e => setMeta({ ...meta, due_date: e.target.value || null })} />
                </Field>
                <Field label="Dönem borcu">
                  <input inputMode="decimal" className={inputClass} value={meta.total_debt ?? ''} onChange={e => setMeta({ ...meta, total_debt: numOrNull(e.target.value) })} />
                </Field>
                <Field label="Asgari ödeme">
                  <input inputMode="decimal" className={inputClass} value={meta.min_payment ?? ''} onChange={e => setMeta({ ...meta, min_payment: numOrNull(e.target.value) })} />
                </Field>
                <Field label="Kart limiti">
                  <input inputMode="decimal" className={inputClass} value={meta.credit_limit ?? ''} onChange={e => setMeta({ ...meta, credit_limit: numOrNull(e.target.value) })} />
                </Field>
              </>
            ) : (
              <Field label="Dönem sonu bakiye">
                <input inputMode="decimal" className={inputClass} value={meta.closing_balance ?? ''} onChange={e => setMeta({ ...meta, closing_balance: numOrNull(e.target.value) })} />
              </Field>
            )}
          </div>
        </Card>
      </div>

      <Card
        title={`${included.length} işlem eklenecek`}
        action={
          <div className="flex gap-1 text-xs">
            {(
              [
                ['all', `Tümü (${rows.length})`],
                ['uncategorized', `Kategorisiz (${totals.uncategorized})`],
                ['duplicate', `Zaten kayıtlı (${totals.duplicates})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-2 py-1 rounded-md ${filter === k ? 'bg-white/10 text-[#F0F0F5]' : 'text-[#8B8B9E] hover:text-[#F0F0F5]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap gap-4 text-sm mb-4">
          <span>
            Çıkış: <strong className="tabular-nums">{formatTRY(totals.out, true)}</strong>
          </span>
          <span>
            Giriş: <strong className="tabular-nums">{formatTRY(totals.in, true)}</strong>
          </span>
          {isCard && meta.total_debt != null && (
            <span className="text-[#8B8B9E]">
              Ekstre dönem borcu: <span className="tabular-nums">{formatTRY(meta.total_debt, true)}</span>
            </span>
          )}
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-[#8B8B9E] border-b border-white/8">
                <th className="py-2 w-8" />
                <th className="py-2 font-medium">Tarih</th>
                <th className="py-2 font-medium">Açıklama</th>
                <th className="py-2 font-medium text-right">Tutar</th>
                <th className="py-2 font-medium pl-3">Kategori</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {visible.map(r => (
                <tr key={r.tempId} className={r.include ? '' : 'opacity-40'}>
                  <td className="py-2">
                    <input type="checkbox" checked={r.include} onChange={e => setRow(r.tempId, { include: e.target.checked })} aria-label="Dahil et" className="accent-[#00D4FF]" />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-[#C3C2CF]">{formatDateTR(r.date)}</td>
                  <td className="py-2 pr-3 max-w-[320px]">
                    <div className="truncate" title={r.description}>
                      {r.merchant}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {r.installment_total && r.installment_total > 1 && (
                        <Badge tone="accent">
                          {r.installment_no}/{r.installment_total} taksit
                        </Badge>
                      )}
                      {r.duplicate && <Badge tone="warning">zaten kayıtlı</Badge>}
                      {r.currency !== 'TRY' && <Badge>{r.currency}</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      title="Yönü değiştir"
                      onClick={() => setRow(r.tempId, { direction: r.direction === 'out' ? 'in' : 'out' })}
                      className={`tabular-nums font-medium ${r.direction === 'in' ? 'text-[#5fd35f]' : ''}`}
                    >
                      {r.direction === 'in' ? '+' : '−'}
                      {r.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </button>
                  </td>
                  <td className="py-2 pl-3">
                    <select
                      className={`${inputClass} py-1.5 ${r.category_id ? '' : 'border-[#fab219]/50'}`}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="sticky bottom-16 lg:bottom-4 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#16151F]/95 backdrop-blur p-4">
        <p className="text-xs text-[#8B8B9E]">
          Değiştirdiğin kategoriler kural olarak kaydedilir; sonraki ekstrelerde aynı işyeri otomatik o kategoriye düşer.
        </p>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-[#f08a8a]">{error}</span>}
          <button type="button" disabled={saving || (!accountId && !newAccount.name)} onClick={confirm} className={buttonClass.primary}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Onayla ve kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
