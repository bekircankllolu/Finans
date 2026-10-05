'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  deleteAccount,
  deleteCategory,
  deleteHolding,
  deleteIncome,
  deleteRule,
  refreshRates,
  saveAccount,
  saveCategory,
  saveHolding,
  saveIncome,
  setManualRate,
} from '@/app/finans/actions'
import { ACCOUNT_TYPE_LABELS, ASSET_LABELS, INCOME_KIND_LABELS } from '@/lib/finans/defaults'
import { formatTRY } from '@/lib/finans/format'
import { holdingValueTRY, toTRY } from '@/lib/finans/calc/networth'
import type { Account, AccountType, AssetCode, Category, CategoryKind, FxRates, Holding, IncomeKind, IncomeSource } from '@/lib/finans/types'
import { Badge, buttonClass, Field, inputClass } from './ui'

type Res = { ok: true } | { ok: false; error: string }
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))
const str = (v: number | null | undefined) => (v == null ? '' : String(v))

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const run = (fn: () => Promise<Res>, onOk?: () => void) =>
    start(async () => {
      const r = await fn()
      if (r.ok) {
        setError('')
        onOk?.()
      } else setError(r.error)
    })
  return { pending, error, run }
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`p-1 text-[#5A5A6E] ${danger ? 'hover:text-[#f08a8a]' : 'hover:text-[#F0F0F5]'}`}>
      {children}
    </button>
  )
}

// ─── Hesaplar ────────────────────────────────────────────────
type AccountForm = {
  id?: string
  type: AccountType
  name: string
  bank: string
  last4: string
  currency: string
  balance: string
  credit_limit: string
  statement_day: string
  due_day: string
  monthly_rate: string
  is_active: boolean
}

const toAccountForm = (a?: Account): AccountForm => ({
  id: a?.id,
  type: a?.type ?? 'checking',
  name: a?.name ?? '',
  bank: a?.bank ?? '',
  last4: a?.last4 ?? '',
  currency: a?.currency ?? 'TRY',
  balance: str(a?.balance ?? 0),
  credit_limit: str(a?.credit_limit),
  statement_day: str(a?.statement_day),
  due_day: str(a?.due_day),
  monthly_rate: str(a?.monthly_rate),
  is_active: a?.is_active ?? true,
})

export function AccountsSettings({ accounts }: { accounts: Account[] }) {
  const [form, setForm] = useState<AccountForm | null>(null)
  const { pending, error, run } = useAction()
  const debtType = form && (form.type === 'credit_card' || form.type === 'kmh')

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-white/6">
        {accounts.map(a => (
          <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm truncate">
                {a.name} {a.last4 && <span className="text-[#5A5A6E]">•{a.last4}</span>} {!a.is_active && <Badge>pasif</Badge>}
              </div>
              <div className="text-xs text-[#8B8B9E]">
                {ACCOUNT_TYPE_LABELS[a.type]} {a.bank ? `· ${a.bank}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm tabular-nums">
                {a.type === 'credit_card' || a.type === 'kmh' ? '−' : ''}
                {a.currency === 'TRY' ? formatTRY(a.balance) : `${a.balance.toLocaleString('tr-TR')} ${a.currency}`}
              </span>
              <IconButton label="Düzenle" onClick={() => setForm(toAccountForm(a))}>
                <Pencil className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton label="Sil" danger onClick={() => window.confirm(`${a.name} silinsin mi? İşlemler kalır ama hesapsız görünür.`) && run(() => deleteAccount(a.id))}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      {form ? (
        <form
          className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-xl border border-white/8 p-3"
          onSubmit={e => {
            e.preventDefault()
            run(
              () =>
                saveAccount({
                  id: form.id,
                  type: form.type,
                  name: form.name,
                  bank: form.bank || null,
                  last4: form.last4 || null,
                  currency: form.currency,
                  balance: num(form.balance) ?? 0,
                  credit_limit: num(form.credit_limit),
                  statement_day: num(form.statement_day),
                  due_day: num(form.due_day),
                  monthly_rate: num(form.monthly_rate),
                  is_active: form.is_active,
                }),
              () => setForm(null),
            )
          }}
        >
          <Field label="Tür">
            <select className={inputClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as AccountType })}>
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ad">
            <input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Banka">
            <input className={inputClass} value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
          </Field>
          <Field label={debtType ? 'Güncel borç' : 'Güncel bakiye'}>
            <input inputMode="decimal" className={inputClass} value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} />
          </Field>
          <Field label="Para birimi">
            <select className={inputClass} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
              {['TRY', 'USD', 'EUR', 'GBP'].map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Son 4 hane">
            <input maxLength={4} inputMode="numeric" className={inputClass} value={form.last4} onChange={e => setForm({ ...form, last4: e.target.value.replace(/\D/g, '') })} />
          </Field>
          {debtType && (
            <>
              <Field label="Limit">
                <input inputMode="decimal" className={inputClass} value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              </Field>
              <Field label="Aylık faiz %" hint="Boşsa %4,25 varsayılır">
                <input inputMode="decimal" className={inputClass} value={form.monthly_rate} onChange={e => setForm({ ...form, monthly_rate: e.target.value })} />
              </Field>
              <Field label="Hesap kesim günü">
                <input inputMode="numeric" className={inputClass} value={form.statement_day} onChange={e => setForm({ ...form, statement_day: e.target.value })} />
              </Field>
              <Field label="Son ödeme günü">
                <input inputMode="numeric" className={inputClass} value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} />
              </Field>
            </>
          )}
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" className="accent-[#00D4FF]" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
            Aktif
          </label>
          <div className="col-span-2 md:col-span-3 flex justify-end items-center gap-2">
            {error && <span className="text-xs text-[#f08a8a]">{error}</span>}
            <button type="button" className={buttonClass.ghost} onClick={() => setForm(null)}>
              Vazgeç
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              Kaydet
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={buttonClass.ghost} onClick={() => setForm(toAccountForm())}>
          <Plus className="w-4 h-4" /> Hesap ekle
        </button>
      )}
    </div>
  )
}

// ─── Gelir kaynakları ────────────────────────────────────────
type IncomeForm = { id?: string; name: string; kind: IncomeKind; amount: string; currency: string; day_of_month: string; is_recurring: boolean; is_active: boolean }
const toIncomeForm = (i?: IncomeSource): IncomeForm => ({
  id: i?.id,
  name: i?.name ?? 'Maaş',
  kind: i?.kind ?? 'salary',
  amount: str(i?.amount),
  currency: i?.currency ?? 'TRY',
  day_of_month: str(i?.day_of_month),
  is_recurring: i?.is_recurring ?? true,
  is_active: i?.is_active ?? true,
})

export function IncomeSettings({ incomes, fx }: { incomes: IncomeSource[]; fx: FxRates }) {
  const [form, setForm] = useState<IncomeForm | null>(null)
  const { pending, error, run } = useAction()
  const monthly = incomes.filter(i => i.is_active && i.is_recurring).reduce((s, i) => s + (toTRY(i.amount, i.currency, fx) ?? 0), 0)

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-white/6">
        {incomes.map(i => (
          <li key={i.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">
                {i.name} {!i.is_recurring && <Badge>düzensiz</Badge>} {!i.is_active && <Badge>pasif</Badge>}
              </div>
              <div className="text-xs text-[#8B8B9E]">
                {INCOME_KIND_LABELS[i.kind]} {i.day_of_month ? `· her ayın ${i.day_of_month}’i` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm tabular-nums">
                {i.amount.toLocaleString('tr-TR')} {i.currency}
              </span>
              <IconButton label="Düzenle" onClick={() => setForm(toIncomeForm(i))}>
                <Pencil className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton label="Sil" danger onClick={() => window.confirm('Silinsin mi?') && run(() => deleteIncome(i.id))}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      {incomes.length > 0 && <p className="text-xs text-[#8B8B9E]">Tahminde kullanılan düzenli aylık gelir: {formatTRY(monthly)}</p>}
      {form ? (
        <form
          className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-xl border border-white/8 p-3"
          onSubmit={e => {
            e.preventDefault()
            run(
              () =>
                saveIncome({
                  id: form.id,
                  name: form.name,
                  kind: form.kind,
                  amount: num(form.amount) ?? 0,
                  currency: form.currency,
                  day_of_month: num(form.day_of_month),
                  is_recurring: form.is_recurring,
                  is_active: form.is_active,
                }),
              () => setForm(null),
            )
          }}
        >
          <Field label="Ad">
            <input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tür">
            <select className={inputClass} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as IncomeKind })}>
              {Object.entries(INCOME_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aylık tutar (net)">
            <input required inputMode="decimal" className={inputClass} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Para birimi">
            <select className={inputClass} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
              {['TRY', 'USD', 'EUR', 'GBP'].map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Ayın kaçında">
            <input inputMode="numeric" className={inputClass} value={form.day_of_month} onChange={e => setForm({ ...form, day_of_month: e.target.value })} />
          </Field>
          <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[#00D4FF]" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} />
              Her ay düzenli (tahmine dahil)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[#00D4FF]" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Aktif
            </label>
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end items-center gap-2">
            {error && <span className="text-xs text-[#f08a8a]">{error}</span>}
            <button type="button" className={buttonClass.ghost} onClick={() => setForm(null)}>
              Vazgeç
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              Kaydet
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={buttonClass.ghost} onClick={() => setForm(toIncomeForm())}>
          <Plus className="w-4 h-4" /> Gelir kaynağı ekle
        </button>
      )}
    </div>
  )
}

// ─── Varlıklar & kurlar ──────────────────────────────────────
type HoldingForm = { id?: string; name: string; asset: AssetCode; quantity: string; unit_price_try: string }
const toHoldingForm = (h?: Holding): HoldingForm => ({
  id: h?.id,
  name: h?.name ?? '',
  asset: h?.asset ?? 'XAU',
  quantity: str(h?.quantity),
  unit_price_try: str(h?.unit_price_try),
})

export function HoldingsSettings({ holdings, fx, fxUpdatedAt }: { holdings: Holding[]; fx: FxRates; fxUpdatedAt: string | null }) {
  const [form, setForm] = useState<HoldingForm | null>(null)
  const [manual, setManual] = useState({ code: 'USD', rate: '' })
  const { pending, error, run } = useAction()
  const needsPrice = form && !['TRY', 'USD', 'EUR', 'GBP', 'XAU'].includes(form.asset)

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-[#8B8B9E]">
            Kurlar (TCMB döviz satış, gram altın){fxUpdatedAt ? ` · ${new Date(fxUpdatedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}` : ''}
          </span>
          <IconButton label="Kurları yenile" onClick={() => run(() => refreshRates())}>
            <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['USD', 'EUR', 'GBP', 'XAU'] as const).map(c => (
            <span key={c}>
              <span className="text-[#8B8B9E]">{ASSET_LABELS[c]}</span> <span className="tabular-nums">{fx[c] ? fx[c]!.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'}</span>
            </span>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2 mt-3"
          onSubmit={e => {
            e.preventDefault()
            run(() => setManualRate({ code: manual.code, rate: num(manual.rate) ?? 0 }), () => setManual({ ...manual, rate: '' }))
          }}
        >
          <select className={`${inputClass} w-28 py-1.5`} value={manual.code} onChange={e => setManual({ ...manual, code: e.target.value })} aria-label="Kur">
            {(['USD', 'EUR', 'GBP', 'XAU'] as const).map(c => (
              <option key={c} value={c}>
                {ASSET_LABELS[c]}
              </option>
            ))}
          </select>
          <input className={`${inputClass} w-32 py-1.5`} inputMode="decimal" placeholder="Elle kur" value={manual.rate} onChange={e => setManual({ ...manual, rate: e.target.value })} aria-label="Kur değeri" />
          <button type="submit" className={`${buttonClass.ghost} py-1.5`} disabled={!manual.rate}>
            Elle gir
          </button>
        </form>
      </div>

      <ul className="divide-y divide-white/6">
        {holdings.map(h => {
          const v = holdingValueTRY(h, fx)
          return (
            <li key={h.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{h.name}</div>
                <div className="text-xs text-[#8B8B9E]">
                  {h.quantity.toLocaleString('tr-TR')} {ASSET_LABELS[h.asset]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums">{v != null ? formatTRY(v) : <Badge tone="warning">kur yok</Badge>}</span>
                <IconButton label="Düzenle" onClick={() => setForm(toHoldingForm(h))}>
                  <Pencil className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton label="Sil" danger onClick={() => window.confirm('Silinsin mi?') && run(() => deleteHolding(h.id))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </li>
          )
        })}
      </ul>

      {form ? (
        <form
          className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-white/8 p-3"
          onSubmit={e => {
            e.preventDefault()
            run(
              () =>
                saveHolding({
                  id: form.id,
                  name: form.name,
                  asset: form.asset,
                  quantity: num(form.quantity) ?? 0,
                  unit_price_try: needsPrice ? num(form.unit_price_try) : null,
                }),
              () => setForm(null),
            )
          }}
        >
          <Field label="Ad">
            <input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ör. Kasadaki altın" />
          </Field>
          <Field label="Varlık">
            <select className={inputClass} value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value as AssetCode })}>
              {Object.entries(ASSET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={form.asset === 'XAU' ? 'Gram' : 'Miktar'}>
            <input required inputMode="decimal" className={inputClass} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          {needsPrice && (
            <Field label="Birim değer (₺)" hint="Fon/hisse için güncel birim fiyat">
              <input inputMode="decimal" className={inputClass} value={form.unit_price_try} onChange={e => setForm({ ...form, unit_price_try: e.target.value })} />
            </Field>
          )}
          <div className="col-span-2 md:col-span-4 flex justify-end items-center gap-2">
            <button type="button" className={buttonClass.ghost} onClick={() => setForm(null)}>
              Vazgeç
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              Kaydet
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={buttonClass.ghost} onClick={() => setForm(toHoldingForm())}>
          <Plus className="w-4 h-4" /> Varlık ekle (döviz, altın, fon, BES)
        </button>
      )}
      {error && <p className="text-xs text-[#f08a8a]">{error}</p>}
    </div>
  )
}

// ─── Kategoriler & kurallar ──────────────────────────────────
const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Gider', income: 'Gelir', transfer: 'Transfer' }

export function CategorySettings({
  categories,
  rules,
}: {
  categories: Category[]
  rules: { id: string; pattern: string; category_id: string }[]
}) {
  const [form, setForm] = useState<{ name: string; kind: CategoryKind; is_fixed: boolean }>({ name: '', kind: 'expense', is_fixed: false })
  const { pending, error, run } = useAction()
  const catName = new Map(categories.map(c => [c.id, c.name]))

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <ul className="divide-y divide-white/6 max-h-96 overflow-y-auto pr-1">
          {categories.map(c => (
            <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                {c.name} <span className="text-xs text-[#5A5A6E]">{KIND_LABELS[c.kind]}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 text-xs text-[#8B8B9E]" title="Sabit giderler (kira, fatura, abonelik) ayrıca raporlanır">
                  <input
                    type="checkbox"
                    className="accent-[#00D4FF]"
                    checked={c.is_fixed}
                    disabled={pending}
                    onChange={e => run(() => saveCategory({ id: c.id, name: c.name, kind: c.kind, is_fixed: e.target.checked }))}
                  />
                  sabit
                </label>
                <IconButton label="Sil" danger onClick={() => window.confirm(`${c.name} silinsin mi? İşlemleri kategorisiz kalır.`) && run(() => deleteCategory(c.id))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap gap-2 mt-3"
          onSubmit={e => {
            e.preventDefault()
            run(() => saveCategory(form), () => setForm({ name: '', kind: 'expense', is_fixed: false }))
          }}
        >
          <input required className={`${inputClass} flex-1 min-w-[140px] py-1.5`} placeholder="Yeni kategori" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select className={`${inputClass} w-28 py-1.5`} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as CategoryKind })} aria-label="Kategori türü">
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={`${buttonClass.primary} py-1.5`}>
            Ekle
          </button>
        </form>
        {error && <p className="text-xs text-[#f08a8a] mt-2">{error}</p>}
      </div>
      <div>
        <div className="text-xs text-[#8B8B9E] mb-2">Öğrenilen kurallar ({rules.length}) — işyeri → kategori</div>
        {rules.length === 0 ? (
          <p className="text-sm text-[#5A5A6E]">Ekstre onayında kategori düzelttikçe burada birikir.</p>
        ) : (
          <ul className="divide-y divide-white/6 max-h-96 overflow-y-auto pr-1">
            {rules.map(r => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">
                  <span className="text-[#C3C2CF]">{r.pattern}</span> <span className="text-[#5A5A6E]">→</span> {catName.get(r.category_id) ?? '?'}
                </span>
                <IconButton label="Kuralı sil" danger onClick={() => run(() => deleteRule(r.id))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
