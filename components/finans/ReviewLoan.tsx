'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import type { DraftLoanSchedule } from '@/lib/finans/types'
import { buttonClass, Card, Field, inputClass } from './ui'

export function ReviewLoan({ statementId, draft }: { statementId: string; draft: DraftLoanSchedule }) {
  const router = useRouter()
  const [loan, setLoan] = useState({
    name: draft.meta.name ?? 'Kredi',
    bank: draft.meta.bank ?? '',
    principal: draft.meta.principal ?? draft.installments.reduce((s, i) => s + i.principal, 0),
    monthly_rate: draft.meta.monthly_rate ?? 0,
    include_taxes: draft.installments.some(i => i.tax > 0),
  })
  const [installments, setInstallments] = useState(draft.installments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/finans/statements/${statementId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loan: { ...loan, bank: loan.bank || null }, installments }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      router.push('/finans/borclar')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {draft.warnings.length > 0 && (
        <div className="rounded-xl border border-[#fab219]/30 bg-[#fab219]/5 p-3 text-sm">{draft.warnings.join(' · ')}</div>
      )}
      <Card title="Kredi bilgileri">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Ad">
            <input className={inputClass} value={loan.name} onChange={e => setLoan({ ...loan, name: e.target.value })} />
          </Field>
          <Field label="Banka">
            <input className={inputClass} value={loan.bank} onChange={e => setLoan({ ...loan, bank: e.target.value })} />
          </Field>
          <Field label="Anapara">
            <input inputMode="decimal" className={inputClass} value={loan.principal} onChange={e => setLoan({ ...loan, principal: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Aylık faiz %">
            <input inputMode="decimal" className={inputClass} value={loan.monthly_rate} onChange={e => setLoan({ ...loan, monthly_rate: Number(e.target.value.replace(',', '.')) || 0 })} />
          </Field>
        </div>
      </Card>
      <Card title={`${installments.length} taksit`}>
        <div className="overflow-x-auto -mx-5 px-5 max-h-[480px]">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="sticky top-0 bg-[#16151F]">
              <tr className="text-left text-xs text-[#8B8B9E] border-b border-white/8">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Vade</th>
                <th className="py-2 font-medium text-right">Anapara</th>
                <th className="py-2 font-medium text-right">Faiz</th>
                <th className="py-2 font-medium text-right">Vergi</th>
                <th className="py-2 font-medium text-right">Taksit</th>
                <th className="py-2 font-medium text-center">Ödendi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {installments.map((i, idx) => (
                <tr key={i.no}>
                  <td className="py-1.5">{i.no}</td>
                  <td className="py-1.5">{formatDateTR(i.due_date)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatTRY(i.principal, true)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatTRY(i.interest, true)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatTRY(i.tax, true)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatTRY(i.total, true)}</td>
                  <td className="py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="accent-[#00D4FF]"
                      checked={i.paid}
                      aria-label={`${i.no}. taksit ödendi`}
                      onChange={e => setInstallments(prev => prev.map((x, j) => (j === idx ? { ...x, paid: e.target.checked } : x)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-end items-center gap-3">
        {error && <span className="text-sm text-[#f08a8a]">{error}</span>}
        <button type="button" onClick={confirm} disabled={saving} className={buttonClass.primary}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Krediyi kaydet
        </button>
      </div>
    </div>
  )
}
