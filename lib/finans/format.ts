const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
})

const tryFormatterPrecise = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatTRY(value: number, precise = false): string {
  return (precise ? tryFormatterPrecise : tryFormatter).format(Number.isFinite(value) ? value : 0)
}

export function formatCompactTRY(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M ₺`
  if (abs >= 10_000) return `${(value / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}B ₺`
  return formatTRY(value)
}

export function formatPct(value: number, digits = 0): string {
  return `%${(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`
}

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const MONTHS_TR_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// 'YYYY-MM' → 'Eki 26'
export function formatMonthShort(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTHS_TR[m - 1]} ${String(y).slice(2)}`
}

export function formatMonthLong(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTHS_TR_LONG[m - 1]} ${y}`
}

// 'YYYY-MM-DD' → '05.10.2026'
export function formatDateTR(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
