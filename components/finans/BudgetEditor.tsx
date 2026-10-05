'use client'

import { useState, useTransition } from 'react'
import { saveBudget } from '@/app/finans/actions'
import { formatTRY } from '@/lib/finans/format'
import { inputClass, Progress } from './ui'

export interface BudgetRow {
  categoryId: string
  name: string
  spent: number
  avg3: number
  limit: number | null
}

export function BudgetEditor({ rows }: { rows: BudgetRow[] }) {
  const [pending, start] = useTransition()
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rows.map(r => [r.categoryId, r.limit ? String(r.limit) : ''])))
  const [error, setError] = useState('')

  function save(r: BudgetRow) {
    const raw = values[r.categoryId]?.replace(/\./g, '').replace(',', '.') ?? ''
    const limit = raw.trim() ? Number(raw) : null
    if (limit === r.limit) return
    start(async () => {
      const res = await saveBudget({ categoryId: r.categoryId, monthlyLimit: limit })
      setError(res.ok ? '' : res.error)
    })
  }

  return (
    <div style={{ opacity: pending ? 0.7 : 1 }}>
      {error && <p className="text-sm text-crit mb-2">{error}</p>}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-line">
              <th className="py-2 font-medium">Kategori</th>
              <th className="py-2 font-medium text-right">3 ay ort.</th>
              <th className="py-2 font-medium text-right">Bu ay</th>
              <th className="py-2 font-medium pl-4 w-40">Aylık limit</th>
              <th className="py-2 font-medium pl-4 w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => {
              const ratio = r.limit ? r.spent / r.limit : 0
              return (
                <tr key={r.categoryId}>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{r.avg3 ? formatTRY(r.avg3) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{formatTRY(r.spent)}</td>
                  <td className="py-2 pl-4">
                    <input
                      className={`${inputClass} py-1 text-right`}
                      inputMode="numeric"
                      placeholder={r.avg3 ? String(Math.round(r.avg3 / 100) * 100) : 'limit yok'}
                      value={values[r.categoryId] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [r.categoryId]: e.target.value }))}
                      onBlur={() => save(r)}
                      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      aria-label={`${r.name} aylık limit`}
                    />
                  </td>
                  <td className="py-2 pl-4">
                    {r.limit ? <Progress value={ratio} tone={ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'good'} label={`${r.name} bütçe kullanımı`} /> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint mt-3">Limiti yazıp Enter’a bas; silmek için alanı boşalt. Öneri olarak 3 aylık ortalama gösterilir.</p>
    </div>
  )
}
