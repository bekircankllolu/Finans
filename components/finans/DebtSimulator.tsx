'use client'

import { useMemo, useState } from 'react'
import { compareStrategies, type Debt } from '@/lib/finans/calc/debtStrategy'
import { formatTRY } from '@/lib/finans/format'
import { PayoffChart } from './LazyCharts'
import { Badge, inputClass } from './ui'

function months(n: number, feasible: boolean) {
  if (!feasible) return '30+ yıl'
  const y = Math.floor(n / 12)
  const m = n % 12
  return [y ? `${y} yıl` : '', m ? `${m} ay` : ''].filter(Boolean).join(' ') || '0 ay'
}

export function DebtSimulator({ debts, suggestedExtra }: { debts: Debt[]; suggestedExtra: number }) {
  const [extra, setExtra] = useState(suggestedExtra)
  const result = useMemo(() => compareStrategies(debts, extra), [debts, extra])
  const best = result.avalanche.totalInterest <= result.snowball.totalInterest ? 'avalanche' : 'snowball'
  const saved = result.minimum.totalInterest - result[best].totalInterest
  const maxExtra = Math.max(10_000, Math.ceil((suggestedExtra * 3) / 1000) * 1000)

  if (!debts.length) return <p className="text-sm text-muted">Simüle edilecek borç yok.</p>

  const cards = [
    { key: 'minimum', title: 'Sadece asgari / taksit', r: result.minimum, desc: 'Hiç ekstra ödeme yapmazsan' },
    { key: 'avalanche', title: 'Çığ (yüksek faiz önce)', r: result.avalanche, desc: 'Matematiksel olarak en az faiz' },
    { key: 'snowball', title: 'Kartopu (küçük borç önce)', r: result.snowball, desc: 'Hızlı küçük zaferler, motivasyon' },
  ] as const

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <label htmlFor="extra">Asgarilere ek aylık ödeme</label>
          <div className="flex items-center gap-2">
            <input
              className={`${inputClass} w-28 py-1 text-right`}
              inputMode="numeric"
              value={extra}
              onChange={e => setExtra(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
              aria-label="Ekstra ödeme tutarı"
            />
            <span className="text-muted">₺/ay</span>
          </div>
        </div>
        <input id="extra" type="range" min={0} max={maxExtra} step={500} value={Math.min(extra, maxExtra)} onChange={e => setExtra(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        {suggestedExtra > 0 && <p className="text-[11px] text-faint mt-1">Öneri: tahmini aylık fazlanın yarısı ≈ {formatTRY(suggestedExtra)}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.key} className={`rounded-xl border p-3 ${c.key === best ? 'border-accent/40 bg-accent-soft' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.title}</span>
              {c.key === best && <Badge tone="accent">önerilen</Badge>}
            </div>
            <div className="text-xs text-muted mb-2">{c.desc}</div>
            <div className="text-lg font-semibold">{months(c.r.months, c.r.feasible)}</div>
            <div className="text-xs text-muted">
              Toplam faiz <span className="text-ink tabular-nums">{formatTRY(c.r.totalInterest)}</span>
            </div>
            {c.key !== 'minimum' && c.r.payoffOrder.length > 0 && (
              <ol className="mt-2 text-[11px] text-muted list-decimal list-inside space-y-0.5">
                {c.r.payoffOrder.map(p => (
                  <li key={p.id}>
                    {p.name} · {p.month}. ay
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      {saved > 0 && (
        <p className="text-sm">
          Ayda {formatTRY(extra)} ekstra ödemeyle sadece asgariye göre <strong>{formatTRY(saved)}</strong> daha az faiz ödersin ve{' '}
          <strong>{months(Math.max(0, result.minimum.months - result[best].months), true)}</strong> daha erken borçsuz kalırsın.
        </p>
      )}

      <PayoffChart
        series={[
          { key: 'minimum', label: 'Sadece asgari', timeline: [debts.reduce((s, d) => s + d.balance, 0), ...result.minimum.timeline] },
          { key: 'avalanche', label: 'Çığ', timeline: [debts.reduce((s, d) => s + d.balance, 0), ...result.avalanche.timeline] },
          { key: 'snowball', label: 'Kartopu', timeline: [debts.reduce((s, d) => s + d.balance, 0), ...result.snowball.timeline] },
        ]}
      />
      <p className="text-[11px] text-faint">
        Kart ve KMH için aylık akdi faiz + %30 KKDF/BSMV varsayılır; asgari ödeme bakiyenin %20’si (limit 50.000 TL üstünde %40). Hesap ayarlarından faiz oranını değiştirebilirsin.
      </p>
    </div>
  )
}
