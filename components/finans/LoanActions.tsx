'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteLoan, setInstallmentPaid } from '@/app/finans/actions'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import type { LoanInstallment } from '@/lib/finans/types'

export function InstallmentTable({ loanId, installments }: { loanId: string; installments: LoanInstallment[] }) {
  const [pending, start] = useTransition()
  return (
    <div className="overflow-x-auto max-h-80 mt-3" style={{ opacity: pending ? 0.6 : 1 }}>
      <table className="w-full text-xs min-w-[520px]">
        <thead className="sticky top-0 bg-[#16151F]">
          <tr className="text-left text-[#8B8B9E] border-b border-white/8">
            <th className="py-1.5 font-medium">#</th>
            <th className="py-1.5 font-medium">Vade</th>
            <th className="py-1.5 font-medium text-right">Anapara</th>
            <th className="py-1.5 font-medium text-right">Faiz+vergi</th>
            <th className="py-1.5 font-medium text-right">Taksit</th>
            <th className="py-1.5 font-medium text-right">Kalan anapara</th>
            <th className="py-1.5 font-medium text-center">Ödendi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {installments.map(i => (
            <tr key={i.no} className={i.paid ? 'text-[#5A5A6E]' : ''}>
              <td className="py-1.5">{i.no}</td>
              <td className="py-1.5">{formatDateTR(i.due_date)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTRY(i.principal)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTRY(i.interest + i.tax)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTRY(i.total)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTRY(i.remaining_principal)}</td>
              <td className="py-1.5 text-center">
                <input
                  type="checkbox"
                  className="accent-[#00D4FF]"
                  checked={i.paid}
                  aria-label={`${i.no}. taksit ödendi`}
                  onChange={e => start(async () => void (await setInstallmentPaid({ loanId, upToNo: i.no, paid: e.target.checked })))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DeleteLoanButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Krediyi sil"
      className="text-[#5A5A6E] hover:text-[#f08a8a] p-1"
      onClick={() => window.confirm('Kredi ve taksit planı silinsin mi?') && start(async () => void (await deleteLoan(id)))}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
