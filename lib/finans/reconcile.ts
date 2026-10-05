// Ekstreden okunan satırların, ekstrenin kendi özet rakamlarıyla tutup tutmadığını kontrol eder.
// Kart:     önceki dönem borcu + çıkışlar − girişler = dönem borcu
// Vadesiz:  açılış bakiyesi + girişler − çıkışlar = kapanış bakiyesi

export interface ReconcileInput {
  account_type: string
  previous_balance: number | null
  total_debt: number | null
  opening_balance: number | null
  closing_balance: number | null
  payments_total: number | null
  purchases_total: number | null
}

export interface ReconcileRow {
  amount: number
  direction: 'in' | 'out'
  include?: boolean
}

export interface ReconcileCheck {
  label: string
  expected: number
  actual: number
  diff: number
  ok: boolean
}

export type ReconcileStatus = 'ok' | 'mismatch' | 'unknown'

export interface Reconciliation {
  status: ReconcileStatus
  diff: number
  checks: ReconcileCheck[]
  totals: { in: number; out: number }
}

export const RECONCILE_TOLERANCE = 1

const r2 = (n: number) => Math.round(n * 100) / 100

function check(label: string, expected: number, actual: number): ReconcileCheck {
  const diff = r2(expected - actual)
  return { label, expected: r2(expected), actual: r2(actual), diff, ok: Math.abs(diff) <= RECONCILE_TOLERANCE }
}

export function reconcile(meta: ReconcileInput, rows: ReconcileRow[]): Reconciliation {
  const active = rows.filter(r => r.include !== false)
  const totalIn = r2(active.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0))
  const totalOut = r2(active.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0))
  const checks: ReconcileCheck[] = []
  const isCard = meta.account_type === 'credit_card'

  if (isCard) {
    if (meta.previous_balance != null && meta.total_debt != null) {
      checks.push(check('Önceki borç + harcamalar − ödemeler = dönem borcu', meta.total_debt, meta.previous_balance + totalOut - totalIn))
    }
    if (meta.purchases_total != null) checks.push(check('Ekstredeki harcama toplamı', meta.purchases_total, totalOut))
    if (meta.payments_total != null) checks.push(check('Ekstredeki ödeme/iade toplamı', meta.payments_total, totalIn))
  } else if (meta.opening_balance != null && meta.closing_balance != null) {
    checks.push(check('Açılış + girişler − çıkışlar = kapanış bakiyesi', meta.closing_balance, meta.opening_balance + totalIn - totalOut))
  }

  if (checks.length === 0) return { status: 'unknown', diff: 0, checks, totals: { in: totalIn, out: totalOut } }
  // Bakiye denklemi varsa belirleyici odur (bankaların ara toplamlarına faiz/ücret dahil olup olmaması
  // değişebildiği için onlar sadece bilgi amaçlı); yoksa ara toplamların hepsi tutmalı.
  const hasBalanceEquation = isCard ? meta.previous_balance != null && meta.total_debt != null : true
  const primary = checks[0]
  const ok = hasBalanceEquation ? primary.ok : checks.every(c => c.ok)
  const diff = hasBalanceEquation ? primary.diff : (checks.find(c => !c.ok)?.diff ?? 0)
  return { status: ok ? 'ok' : 'mismatch', diff, checks, totals: { in: totalIn, out: totalOut } }
}

// Fark tutarını tek bir satırla açıklayabilecek adayları bulur (yön hatası veya fazladan/eksik satır).
export function explainDiff(diff: number, rows: (ReconcileRow & { tempId: string })[]): { tempId: string; reason: string }[] {
  if (Math.abs(diff) <= RECONCILE_TOLERANCE) return []
  const hits: { tempId: string; reason: string }[] = []
  for (const row of rows) {
    if (row.include === false) continue
    if (Math.abs(Math.abs(diff) - row.amount) <= RECONCILE_TOLERANCE) hits.push({ tempId: row.tempId, reason: 'Fark bu satırın tutarına eşit: fazladan okunmuş olabilir.' })
    else if (Math.abs(Math.abs(diff) - 2 * row.amount) <= RECONCILE_TOLERANCE) hits.push({ tempId: row.tempId, reason: 'Fark bu satırın iki katı: yönü (giriş/çıkış) ters olabilir.' })
  }
  return hits.slice(0, 5)
}
