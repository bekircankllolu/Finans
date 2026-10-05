import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths } from '@/lib/finans/calc/dates'
import type { PeriodMode } from '@/lib/finans/calc/period'
import { formatMonthLong } from '@/lib/finans/format'
import { cn } from '@/lib/utils'

// Dönem seçici: ◀ Eylül 2026 ▶ + Takvim ayı / Kart dönemi. Durum URL'de tutulur (?ay=…&mod=kart),
// böylece sayfa sunucuda doğru dönemle render edilir ve paylaşılabilir/yer imi olur.
export function PeriodPicker({ month, mode, min, max }: { month: string; mode: PeriodMode; min: string; max: string }) {
  const href = (m: string, md: PeriodMode) => `/finans?ay=${m}${md === 'card' ? '&mod=kart' : ''}`
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  const arrow = 'inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-ink hover:bg-hover transition'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border border-line bg-surface shadow-card">
        {prev >= min ? (
          <Link href={href(prev, mode)} className={arrow} aria-label="Önceki ay" scroll={false}>
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : (
          <span className={cn(arrow, 'opacity-30')} aria-hidden>
            <ChevronLeft className="w-4 h-4" />
          </span>
        )}
        <span className="px-2 text-sm font-medium min-w-[112px] text-center tabular-nums">{formatMonthLong(month)}</span>
        {next <= max ? (
          <Link href={href(next, mode)} className={arrow} aria-label="Sonraki ay" scroll={false}>
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <span className={cn(arrow, 'opacity-30')} aria-hidden>
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="flex rounded-xl border border-line bg-surface p-1 shadow-card text-sm" role="tablist" aria-label="Dönem türü">
        {(
          [
            ['month', 'Takvim ayı'],
            ['card', 'Kart dönemi'],
          ] as const
        ).map(([m, label]) => (
          <Link
            key={m}
            href={href(month, m)}
            scroll={false}
            role="tab"
            aria-selected={mode === m}
            title={m === 'card' ? 'Her kart kendi hesap kesim dönemine göre (o ay kesilen ekstre)' : 'Ayın 1’inden son gününe'}
            className={cn('px-3 py-1.5 rounded-lg transition', mode === m ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-ink')}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
