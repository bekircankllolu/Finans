'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { addManualTransaction, deleteTransactions, setTransactionCategory } from '@/app/finans/actions'
import { categoryMap, signedExpense, signedIncome } from '@/lib/finans/calc/cashflow'
import { lastMonths, monthKey } from '@/lib/finans/calc/dates'
import { formatDateTR, formatMonthLong, formatTRY } from '@/lib/finans/format'
import type { Account, Category, Transaction } from '@/lib/finans/types'
import { CategoryTrendChart } from './charts'
import { Badge, buttonClass, Card, Field, inputClass } from './ui'

const PAGE = 300

export function TransactionsTable({
  transactions,
  categories,
  accounts,
  defaultMonth,
  currentMonth,
}: {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  defaultMonth: string
  currentMonth: string
}) {
  const [month, setMonth] = useState(defaultMonth)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [direction, setDirection] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [bulkCat, setBulkCat] = useState('')
  const [learn, setLearn] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')

  const cats = useMemo(() => categoryMap(categories), [categories])
  const accName = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts])
  const months = useMemo(() => [...new Set(transactions.map(t => monthKey(t.date)))].sort().reverse(), [transactions])

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return transactions.filter(
      t =>
        (!month || monthKey(t.date) === month) &&
        (!accountId || t.account_id === accountId) &&
        (!categoryId || (categoryId === 'none' ? !t.category_id : t.category_id === categoryId)) &&
        (!direction || t.direction === direction) &&
        (!needle || `${t.merchant} ${t.description}`.toLocaleLowerCase('tr-TR').includes(needle)),
    )
  }, [transactions, month, accountId, categoryId, direction, q])

  const totals = useMemo(
    () => ({
      expense: filtered.reduce((s, t) => s + signedExpense(t, cats), 0),
      income: filtered.reduce((s, t) => s + signedIncome(t, cats), 0),
    }),
    [filtered, cats],
  )

  const trend = useMemo(() => {
    if (!categoryId || categoryId === 'none') return null
    const cat = cats.get(categoryId)
    const ms = lastMonths(currentMonth, 12)
    const byMonth = new Map(ms.map(m => [m, 0]))
    for (const t of transactions) {
      if (t.category_id !== categoryId || !byMonth.has(monthKey(t.date))) continue
      byMonth.set(monthKey(t.date), byMonth.get(monthKey(t.date))! + (cat?.kind === 'income' ? signedIncome(t, cats) : signedExpense(t, cats)))
    }
    return { label: cat?.name ?? '', data: ms.map(m => ({ month: m, value: byMonth.get(m)! })) }
  }, [categoryId, cats, transactions, currentMonth])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const res = await fn()
      setMessage(res.ok ? success : (res.error ?? 'Hata'))
      if (res.ok) setSelected(new Set())
    })
  }

  const visible = filtered.slice(0, limit)
  const allVisibleSelected = visible.length > 0 && visible.every(t => selected.has(t.id))

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <select className={inputClass} value={month} onChange={e => setMonth(e.target.value)} aria-label="Ay">
            <option value="">Tüm aylar</option>
            {months.map(m => (
              <option key={m} value={m}>
                {formatMonthLong(m)}
              </option>
            ))}
          </select>
          <select className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)} aria-label="Hesap">
            <option value="">Tüm hesaplar</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className={inputClass} value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Kategori">
            <option value="">Tüm kategoriler</option>
            <option value="none">Kategorisiz</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={inputClass} value={direction} onChange={e => setDirection(e.target.value)} aria-label="Yön">
            <option value="">Giriş + çıkış</option>
            <option value="out">Sadece çıkış</option>
            <option value="in">Sadece giriş</option>
          </select>
          <input className={`${inputClass} col-span-2`} placeholder="İşyeri veya açıklama ara…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mt-4">
          <span className="text-[#8B8B9E]">{filtered.length} işlem</span>
          <span>
            Gider: <strong className="tabular-nums">{formatTRY(totals.expense)}</strong>
          </span>
          <span>
            Gelir: <strong className="tabular-nums">{formatTRY(totals.income)}</strong>
          </span>
          <span className="text-[#5A5A6E] text-xs self-center">Transferler (kart ödemesi vb.) toplamlara dahil değildir.</span>
        </div>
      </Card>

      {trend && (
        <Card title={`${trend.label} · son 12 ay`}>
          <CategoryTrendChart data={trend.data} label={trend.label} />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass.ghost} onClick={() => setShowAdd(v => !v)}>
          <Plus className="w-4 h-4" /> Manuel işlem
        </button>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#16151F] px-3 py-2">
            <span className="text-sm">{selected.size} seçili</span>
            <select className={`${inputClass} w-48 py-1.5`} value={bulkCat} onChange={e => setBulkCat(e.target.value)} aria-label="Yeni kategori">
              <option value="">Kategori seç…</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-[#8B8B9E]">
              <input type="checkbox" className="accent-[#00D4FF]" checked={learn} onChange={e => setLearn(e.target.checked)} />
              Bu işyerleri için hatırla
            </label>
            <button
              type="button"
              disabled={!bulkCat || pending}
              className={buttonClass.primary}
              onClick={() => act(() => setTransactionCategory({ ids: [...selected], categoryId: bulkCat, learn }), 'Kategori güncellendi')}
            >
              Uygula
            </button>
            <button
              type="button"
              disabled={pending}
              className={buttonClass.danger}
              onClick={() => window.confirm(`${selected.size} işlem silinsin mi?`) && act(() => deleteTransactions([...selected]), 'Silindi')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
        {message && <span className="text-sm text-[#8B8B9E]">{message}</span>}
      </div>

      {showAdd && <ManualForm accounts={accounts} categories={categories} onDone={msg => { setMessage(msg); setShowAdd(false) }} />}

      <Card>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[720px]" style={{ opacity: pending ? 0.6 : 1 }}>
            <thead>
              <tr className="text-left text-xs text-[#8B8B9E] border-b border-white/8">
                <th className="py-2 w-8">
                  <input
                    type="checkbox"
                    className="accent-[#00D4FF]"
                    aria-label="Tümünü seç"
                    checked={allVisibleSelected}
                    onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(t => t.id)))}
                  />
                </th>
                <th className="py-2 font-medium">Tarih</th>
                <th className="py-2 font-medium">İşyeri</th>
                <th className="py-2 font-medium">Kategori</th>
                <th className="py-2 font-medium">Hesap</th>
                <th className="py-2 font-medium text-right">Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {visible.map(t => {
                const cat = t.category_id ? cats.get(t.category_id) : undefined
                return (
                  <tr key={t.id} className={selected.has(t.id) ? 'bg-white/[0.03]' : ''}>
                    <td className="py-2">
                      <input type="checkbox" className="accent-[#00D4FF]" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label="Seç" />
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[#C3C2CF]">{formatDateTR(t.date)}</td>
                    <td className="py-2 pr-3 max-w-[300px]">
                      <div className="truncate" title={t.description}>
                        {t.merchant}
                      </div>
                      <div className="flex gap-1">
                        {t.installment_total && t.installment_total > 1 && (
                          <Badge tone="accent">
                            {t.installment_no}/{t.installment_total}
                          </Badge>
                        )}
                        {t.source === 'manual' && <Badge>manuel</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {cat ? (
                        <span className={cat.kind === 'transfer' ? 'text-[#5A5A6E]' : 'text-[#C3C2CF]'}>{cat.name}</span>
                      ) : (
                        <Badge tone="warning">kategorisiz</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[#8B8B9E] truncate max-w-[140px]">{t.account_id ? accName.get(t.account_id) : '—'}</td>
                    <td className={`py-2 text-right tabular-nums whitespace-nowrap font-medium ${t.direction === 'in' ? 'text-[#5fd35f]' : ''}`}>
                      {t.direction === 'in' ? '+' : '−'}
                      {formatTRY(t.amount_try, true)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <button type="button" className={`${buttonClass.ghost} mt-4`} onClick={() => setLimit(l => l + PAGE)}>
            Daha fazla göster ({filtered.length - limit})
          </button>
        )}
        {filtered.length === 0 && <p className="text-sm text-[#8B8B9E] py-6 text-center">Bu filtrede işlem yok.</p>}
      </Card>
    </div>
  )
}

function ManualForm({ accounts, categories, onDone }: { accounts: Account[]; categories: Category[]; onDone: (msg: string) => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    direction: 'out' as 'in' | 'out',
    currency: 'TRY',
    account_id: '',
    category_id: '',
  })

  return (
    <Card title="Manuel işlem (nakit harcama, ekstrede olmayan gelir…)">
      <form
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        onSubmit={e => {
          e.preventDefault()
          start(async () => {
            const res = await addManualTransaction({
              date: form.date,
              description: form.description,
              amount: Number(form.amount.replace(',', '.')),
              direction: form.direction,
              currency: form.currency,
              account_id: form.account_id || null,
              category_id: form.category_id || null,
            })
            if (res.ok) onDone('İşlem eklendi')
            else setError(res.error)
          })
        }}
      >
        <Field label="Tarih">
          <input type="date" required className={inputClass} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Açıklama">
          <input required className={inputClass} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="ör. Pazar alışverişi" />
        </Field>
        <Field label="Tutar">
          <input required inputMode="decimal" className={inputClass} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Yön">
          <select className={inputClass} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as 'in' | 'out' })}>
            <option value="out">Gider / çıkış</option>
            <option value="in">Gelir / giriş</option>
          </select>
        </Field>
        <Field label="Para birimi">
          <select className={inputClass} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
            {['TRY', 'USD', 'EUR', 'GBP'].map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Hesap">
          <select className={inputClass} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
            <option value="">Nakit / hesapsız</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kategori">
          <select className={inputClass} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">—</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={pending} className={buttonClass.primary}>
            Ekle
          </button>
          {error && <span className="text-xs text-[#f08a8a]">{error}</span>}
        </div>
      </form>
    </Card>
  )
}
