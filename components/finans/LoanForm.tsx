'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createLoan } from '@/app/finans/actions'
import { annuityPayment } from '@/lib/finans/calc/loans'
import { formatTRY } from '@/lib/finans/format'
import { buttonClass, Card, Field, inputClass } from './ui'

export function LoanForm() {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [f, setF] = useState({ name: 'İhtiyaç Kredisi', bank: '', principal: '', monthly_rate: '', term_months: '', first_due_date: '', include_taxes: true })

  const preview = useMemo(() => {
    const p = Number(f.principal.replace(',', '.'))
    const r = Number(f.monthly_rate.replace(',', '.'))
    const n = Number(f.term_months)
    if (!(p > 0 && r >= 0 && n > 0)) return null
    const pay = annuityPayment(p, r, n, f.include_taxes)
    return { pay, total: pay * n, cost: pay * n - p }
  }, [f])

  if (!open) {
    return (
      <button type="button" className={buttonClass.ghost} onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Kredi ekle (manuel)
      </button>
    )
  }

  return (
    <Card title="Yeni kredi" action={<button type="button" className="text-xs text-[#8B8B9E]" onClick={() => setOpen(false)}>Kapat</button>}>
      <p className="text-xs text-[#8B8B9E] mb-3">Bankanın ödeme planı PDF’i varsa Ekstre sayfasından “Kredi ödeme planı” olarak yüklemek daha isabetlidir.</p>
      <form
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        onSubmit={e => {
          e.preventDefault()
          start(async () => {
            const res = await createLoan({
              name: f.name,
              bank: f.bank || null,
              principal: Number(f.principal.replace(',', '.')),
              monthly_rate: Number(f.monthly_rate.replace(',', '.')),
              term_months: Number(f.term_months),
              first_due_date: f.first_due_date,
              include_taxes: f.include_taxes,
            })
            if (res.ok) setOpen(false)
            else setError(res.error)
          })
        }}
      >
        <Field label="Ad">
          <input required className={inputClass} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Banka">
          <input className={inputClass} value={f.bank} onChange={e => setF({ ...f, bank: e.target.value })} />
        </Field>
        <Field label="Çekilen tutar (₺)">
          <input required inputMode="decimal" className={inputClass} value={f.principal} onChange={e => setF({ ...f, principal: e.target.value })} />
        </Field>
        <Field label="Aylık faiz (%)" hint="ör. 3,29">
          <input required inputMode="decimal" className={inputClass} value={f.monthly_rate} onChange={e => setF({ ...f, monthly_rate: e.target.value })} />
        </Field>
        <Field label="Vade (ay)">
          <input required inputMode="numeric" className={inputClass} value={f.term_months} onChange={e => setF({ ...f, term_months: e.target.value })} />
        </Field>
        <Field label="İlk taksit tarihi">
          <input required type="date" className={inputClass} value={f.first_due_date} onChange={e => setF({ ...f, first_due_date: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm col-span-2 self-end pb-2">
          <input type="checkbox" className="accent-[#00D4FF]" checked={f.include_taxes} onChange={e => setF({ ...f, include_taxes: e.target.checked })} />
          KKDF + BSMV uygulanır (tüketici kredisi)
        </label>
        <div className="col-span-2 md:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-sm text-[#8B8B9E]">
            {preview && (
              <>
                Aylık taksit <strong className="text-[#F0F0F5]">{formatTRY(preview.pay, true)}</strong> · Toplam geri ödeme {formatTRY(preview.total)} · Faiz+vergi{' '}
                {formatTRY(preview.cost)}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-[#f08a8a]">{error}</span>}
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              Kaydet
            </button>
          </div>
        </div>
      </form>
    </Card>
  )
}
