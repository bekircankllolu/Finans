'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteGoal, saveGoal } from '@/app/finans/actions'
import type { GoalProgress } from '@/lib/finans/calc/snapshot'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import { buttonClass, Field, inputClass, Progress } from './ui'

type Form = { id?: string; name: string; target_amount: string; current_amount: string; target_date: string }
const empty: Form = { name: '', target_amount: '', current_amount: '0', target_date: '' }

export function Goals({ goals, monthlySurplus }: { goals: GoalProgress[]; monthlySurplus: number }) {
  const [form, setForm] = useState<Form | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const n = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))

  return (
    <div className="space-y-4">
      {goals.length === 0 && !form && <p className="text-sm text-[#8B8B9E]">Henüz birikim hedefi yok.</p>}
      <ul className="space-y-4">
        {goals.map(g => {
          const feasible = g.requiredMonthly == null || g.requiredMonthly <= Math.max(0, monthlySurplus)
          return (
            <li key={g.goal.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{g.goal.name}</div>
                  <div className="text-xs text-[#8B8B9E]">
                    {formatTRY(g.goal.current_amount)} / {formatTRY(g.goal.target_amount)}
                    {g.goal.target_date && ` · hedef ${formatDateTR(g.goal.target_date)}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Düzenle"
                    className="p-1 text-[#5A5A6E] hover:text-[#F0F0F5]"
                    onClick={() =>
                      setForm({
                        id: g.goal.id,
                        name: g.goal.name,
                        target_amount: String(g.goal.target_amount),
                        current_amount: String(g.goal.current_amount),
                        target_date: g.goal.target_date ?? '',
                      })
                    }
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Sil"
                    className="p-1 text-[#5A5A6E] hover:text-[#f08a8a]"
                    onClick={() => window.confirm('Hedef silinsin mi?') && start(async () => void (await deleteGoal(g.goal.id)))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <Progress value={g.ratio} label={g.goal.name} />
              </div>
              {g.requiredMonthly != null && g.remaining > 0 && (
                <p className={`text-xs mt-1 ${feasible ? 'text-[#8B8B9E]' : 'text-[#ec835a]'}`}>
                  Hedefe ulaşmak için ayda {formatTRY(g.requiredMonthly)} ayırmalısın ({g.monthsLeft} ay).
                  {!feasible && ` Tahmini aylık fazlan ${formatTRY(Math.max(0, monthlySurplus))}; tarih veya tutarı gözden geçir.`}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {form ? (
        <form
          className="grid grid-cols-2 gap-3 rounded-xl border border-white/8 p-3"
          onSubmit={e => {
            e.preventDefault()
            start(async () => {
              const res = await saveGoal({
                id: form.id,
                name: form.name,
                target_amount: n(form.target_amount),
                current_amount: n(form.current_amount || '0'),
                target_date: form.target_date || null,
              })
              if (res.ok) setForm(null)
              else setError(res.error)
            })
          }}
        >
          <Field label="Hedef adı">
            <input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ör. Acil durum fonu" />
          </Field>
          <Field label="Hedef tutar (₺)">
            <input required inputMode="decimal" className={inputClass} value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} />
          </Field>
          <Field label="Şu an biriken (₺)">
            <input inputMode="decimal" className={inputClass} value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })} />
          </Field>
          <Field label="Hedef tarih">
            <input type="date" className={inputClass} value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2 items-center">
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
        <button type="button" className={buttonClass.ghost} onClick={() => setForm(empty)}>
          <Plus className="w-4 h-4" /> Hedef ekle
        </button>
      )}
    </div>
  )
}
