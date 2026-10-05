import type { CategorySlice } from '@/lib/finans/calc/cashflow'
import { formatTRY } from '@/lib/finans/format'

// Kategori kırılımı: donut yerine sıralı yatay çubuk (yakın değerler okunabilsin, renk tek seri).
export function CategoryBars({ slices, limit = 8 }: { slices: CategorySlice[]; limit?: number }) {
  const top = slices.slice(0, limit)
  const rest = slices.slice(limit)
  const rows = rest.length
    ? [
        ...top,
        {
          categoryId: 'other',
          name: `Diğer (${rest.length})`,
          color: '',
          amount: rest.reduce((s, r) => s + r.amount, 0),
          share: rest.reduce((s, r) => s + r.share, 0),
          prevAmount: rest.reduce((s, r) => s + r.prevAmount, 0),
          avg3: rest.reduce((s, r) => s + r.avg3, 0),
        },
      ]
    : top
  const max = Math.max(1, ...rows.map(r => r.amount))

  return (
    <ul className="space-y-3">
      {rows.map(r => {
        const diff = r.avg3 > 0 ? (r.amount - r.avg3) / r.avg3 : null
        return (
          <li key={r.categoryId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="flex items-baseline gap-2 shrink-0">
                {diff != null && Math.abs(diff) >= 0.15 && (
                  <span className={`text-[11px] ${diff > 0 ? 'text-serious' : 'text-good'}`} title="3 aylık ortalamaya göre">
                    {diff > 0 ? '▲' : '▼'} %{Math.round(Math.abs(diff) * 100)}
                  </span>
                )}
                <span className="font-medium tabular-nums">{formatTRY(r.amount)}</span>
                <span className="text-xs text-faint w-9 text-right tabular-nums">%{Math.round(r.share * 100)}</span>
              </span>
            </div>
            <div className="h-1.5 mt-1.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-series-1" style={{ width: `${(r.amount / max) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
