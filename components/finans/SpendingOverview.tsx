'use client'

import { useId, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown } from 'lucide-react'
import { Card } from './ui'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import type { SpendingSlice } from '@/lib/finans/calc/spending'
import { cn } from '@/lib/utils'

const COLORS = ['#5260ed', '#ef9850', '#24a58c', '#ae6be3', '#e56b91', '#329dc7', '#8492a9']
const pct = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })

export function SpendingOverview({ slices, total, refunds, income, expense, period }: {
  slices: SpendingSlice[]; total: number; refunds: number; income: number; expense: number; period: string
}) {
  const [selectedId, setSelectedId] = useState(slices[0]?.id ?? '')
  const [showAll, setShowAll] = useState(false)
  const detailId = useId()
  const selected = slices.find(s => s.id === selectedId) ?? slices[0]
  const selectedIndex = slices.findIndex(s => s.id === selected?.id)
  const remaining = income - expense
  const select = (id: string) => { setSelectedId(id); setShowAll(false) }
  const visibleRows = selected?.rows.slice(0, showAll ? undefined : 8) ?? []

  return (
    <div className="space-y-6">
      <div className="grid xl:grid-cols-12 gap-6 items-stretch">
        <Card className="xl:col-span-7" title="Param nereye gitti?">
          <p className="text-sm text-muted mb-5">Büyük dilim, daha çok harcama demek. Detayları görmek için bir dilime veya kategoriye dokun.</p>
          {total <= 0 ? <div className="rounded-2xl bg-surface-2 p-8 text-center text-muted">Bu dönemde harcama kaydı yok.</div> : (
            <>
              <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-center">
                <div className="relative w-full max-w-[280px] mx-auto aspect-square">
                  <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible" role="group" aria-label="Kategoriye göre harcama dağılımı">
                    {slices.map((slice, i) => {
                      const share = slice.amount / total
                      const start = slices.slice(0, i).reduce((sum, item) => sum + item.amount, 0) / total * 100
                      return <circle key={slice.id} cx="120" cy="120" r="91" fill="none" pathLength="100"
                        stroke={COLORS[i]} strokeWidth={selected?.id === slice.id ? 33 : 26}
                        strokeDasharray={`${Math.max(share * 100 - (slices.length > 1 ? 0.7 : 0), 0.05)} 100`}
                        strokeDashoffset={-start} transform="rotate(-90 120 120)"
                        className="cursor-pointer transition-[stroke-width] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        tabIndex={0} role="button" aria-pressed={selected?.id === slice.id} aria-controls={detailId}
                        aria-label={`${slice.name}: ${formatTRY(slice.amount)}, harcamaların yüzde ${pct(share * 100)} kadarı. Detayları göster.`}
                        onClick={() => select(slice.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(slice.id) } }}>
                        <title>{`${slice.name} · ${formatTRY(slice.amount)} · %${pct(share * 100)}`}</title>
                      </circle>
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none px-16 text-center">
                    <span className="text-xs text-muted">Toplam harcama</span>
                    <span className="text-xl font-semibold tracking-tight mt-1 tabular-nums break-all">{formatTRY(total)}</span>
                    <span className="text-xs text-muted mt-1">{slices.length > 0 ? 'Dilimlere dokun' : ''}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 min-w-0">
                  {slices.map((slice, i) => <li key={slice.id}>
                    <button type="button" onClick={() => select(slice.id)} aria-pressed={selected?.id === slice.id} aria-controls={detailId}
                      className={cn('w-full rounded-xl p-3 text-left flex gap-3 items-start border transition-colors focus-visible:outline-2 focus-visible:outline-accent', selected?.id === slice.id ? 'border-accent/30 bg-accent-soft' : 'border-transparent hover:bg-surface-2')}>
                      <span className="mt-1 w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium break-words">{slice.name}</span><span className="text-xs text-muted">{formatTRY(slice.amount)}</span></span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">%{pct(slice.amount / total * 100)}</span>
                    </button>
                  </li>)}
                </ul>
              </div>
              <div className="mt-5 rounded-xl bg-surface-2 p-4 text-sm leading-relaxed">
                En çok <strong>{slices[0].name}</strong> için harcadın: <strong>{formatTRY(slices[0].amount)}</strong>.
                {' '}Her 100 TL harcamanın yaklaşık {Math.round(slices[0].amount / total * 100)} TL’si buraya gitti.
              </div>
            </>
          )}
          <p className="text-xs text-muted mt-4 leading-relaxed">{period}. Transferler ve kart borcu ödemeleri sayılmaz.
            {refunds > 0 && <> Grafik iadeler düşülmeden yapılan harcamaları gösterir. {formatTRY(refunds)} iade düşüldüğünde net gider {formatTRY(expense)}.</>}
          </p>
        </Card>
        <Card className="xl:col-span-5" title="Gelirimin ne kadarı harcandı?">
          <p className="text-sm text-muted mb-6">Seçtiğin dönemde kaydedilen gelir ve giderlerin.</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl bg-accent-soft p-4 min-w-0"><div className="flex items-center gap-1 text-xs text-accent"><ArrowDownRight className="w-4 h-4" /> Gelen para</div><div className="text-xl font-semibold tabular-nums mt-2 break-all">{formatTRY(income)}</div></div>
            <div className="rounded-2xl bg-warn-bg p-4 min-w-0"><div className="flex items-center gap-1 text-xs text-warn"><ArrowUpRight className="w-4 h-4" /> Harcanan para</div><div className="text-xl font-semibold tabular-nums mt-2 break-all">{formatTRY(expense)}</div></div>
          </div>
          {income > 0 ? <>
            <div className="text-3xl font-semibold tabular-nums">%{pct(Math.max(expense, 0) / income * 100)}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">Her 100 TL gelirinin {pct(Math.max(expense, 0) / income * 100)} TL’si harcamalara gitti.</p>
            <div className="h-5 rounded-full bg-good-bg overflow-hidden mt-5" role="img" aria-label={`Gelirin yüzde ${pct(Math.max(expense, 0) / income * 100)} kadarı harcandı`}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, expense / income * 100))}%` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted mt-2"><span>Harcanan: {formatTRY(expense)}</span><span>{remaining >= 0 ? 'Kalan' : 'Geliri aşan'}: {formatTRY(Math.abs(remaining))}</span></div>
            <div className={cn('rounded-xl p-4 mt-6 text-sm leading-relaxed', remaining < 0 ? 'bg-crit-bg text-crit' : 'bg-good-bg text-good')}>
              {remaining < 0 ? <>Gelirinden <strong>{formatTRY(-remaining)}</strong> fazla harcadın.</> : <>Gelirinden <strong>{formatTRY(remaining)}</strong> kaldı.</>}
              <span className="block text-xs mt-1">Bu fark, banka hesabının bakiyesi değildir; yalnızca bu dönemin gelir ve gider farkıdır.</span>
            </div>
            {selected && <div className="mt-5 text-sm leading-relaxed"><strong>{selected.name}</strong> için yapılan harcama, gelirinin <strong>%{pct(selected.amount / income * 100)}</strong> kadarı.{selected.refunds > 0 && <span className="block text-xs text-muted">Bu kategoride ayrıca {formatTRY(selected.refunds)} iade var.</span>}</div>}
            {slices.length > 0 && <div className="mt-6 pt-5 border-t border-line">
              <h4 className="text-sm font-semibold mb-3">Gelirinde en çok yer tutan harcamalar</h4>
              <ul className="space-y-4">
                {slices.slice(0, 3).map((slice, i) => <li key={slice.id}>
                  <button type="button" onClick={() => select(slice.id)} className="w-full text-left rounded-lg" aria-controls={detailId}>
                    <span className="flex justify-between gap-3 text-xs mb-2"><span className="min-w-0 break-words">{slice.name}</span><span className="shrink-0 font-semibold tabular-nums">Gelirin %{pct(slice.amount / income * 100)} kadarı</span></span>
                    <span className="block h-2.5 bg-surface-2 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, slice.amount / income * 100)}%`, background: COLORS[i] }} /></span>
                  </button>
                </li>)}
              </ul>
              <p className="text-xs text-muted mt-3">Çubuklar, iadeler düşülmeden yapılan harcamaların gelirindeki payını gösterir.</p>
            </div>}
          </> : <div className="rounded-xl bg-surface-2 p-5 text-sm text-muted leading-relaxed">Bu dönemde gelir kaydı yok. Gelir işlemlerini eklediğinde harcamalarının gelirine oranını burada görebilirsin.</div>}
          <p className="text-xs text-muted mt-5 leading-relaxed">Kart dönemi seçiliyse her kartın kendi hesap kesim aralığı kullanılır. Diğer hesaplar seçilen takvim ayına göre hesaplanır.</p>
        </Card>
      </div>
      {selected && <Card title={`${selected.name} · işlem detayları`}>
        <div id={detailId} aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm mb-5">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: COLORS[selectedIndex] }} /><strong>{formatTRY(selected.amount)}</strong> harcama</span>
            {selected.refunds > 0 && <span className="text-good">{formatTRY(selected.refunds)} iade</span>}
            <span className="text-muted">{selected.rows.length} işlem · {period}</span>
          </div>
          <ul className="divide-y divide-line">
            {visibleRows.map(row => <li key={row.id} className="flex flex-wrap sm:flex-nowrap items-start gap-x-4 gap-y-1 py-4">
              <span className="text-xs text-muted shrink-0 w-20 pt-1">{formatDateTR(row.date)}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium break-words">{row.merchant}</div><div className="text-xs text-muted mt-1 break-words">{row.category} · {row.account}</div></div>
              <span className={cn('text-sm font-semibold tabular-nums shrink-0 ml-auto', row.amount < 0 && 'text-good')}>{row.amount < 0 ? 'İade +' : ''}{formatTRY(Math.abs(row.amount), true)}</span>
            </li>)}
          </ul>
          {selected.rows.length > 8 && <button type="button" onClick={() => setShowAll(v => !v)} className="mt-4 inline-flex items-center gap-2 text-sm text-accent rounded-lg p-2 hover:bg-accent-soft">{showAll ? 'Daha az göster' : `${selected.rows.length} işlemin tamamını göster`}<ChevronDown className={cn('w-4 h-4', showAll && 'rotate-180')} /></button>}
        </div>
      </Card>}
    </div>
  )
}
