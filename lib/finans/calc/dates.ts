// Tarih yardımcıları. Tüm tarihler 'YYYY-MM-DD' string, ay anahtarları 'YYYY-MM'.
// Saat dilimi kaymalarından kaçınmak için Date yerine string/aritmetik kullanılır.

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Aya gün ekleyerek tarih üretir; gün ay sonunu aşarsa ay sonuna kırpılır (31 → 28/30)
export function dateInMonth(month: string, day: number): string {
  const d = Math.min(Math.max(day, 1), daysInMonth(month))
  return `${month}-${String(d).padStart(2, '0')}`
}

export function addMonthsToDate(date: string, n: number): string {
  const day = Number(date.slice(8, 10))
  return dateInMonth(addMonths(monthKey(date), n), day)
}

export function diffDays(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [y1, m1] = fromMonth.split('-').map(Number)
  const [y2, m2] = toMonth.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

// Son n ay (bu ay dahil), eskiden yeniye
export function lastMonths(current: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(current, i - n + 1))
}

export function todayISO(now: Date = new Date()): string {
  // Türkiye saatine göre bugün
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)
}
