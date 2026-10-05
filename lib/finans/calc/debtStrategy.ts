export interface Debt {
  id: string
  name: string
  kind: 'card' | 'kmh' | 'loan'
  balance: number
  // Aylık efektif faiz (%), vergiler dahil
  monthlyRatePct: number
  // Sabit asgari/taksit tutarı
  minPayment: number
  // Kartlarda asgari ödeme bakiyenin yüzdesi olarak yeniden hesaplanır
  minPct?: number
}

export type Strategy = 'avalanche' | 'snowball' | 'minimum'

export interface StrategyResult {
  strategy: Strategy
  feasible: boolean
  months: number
  totalInterest: number
  totalPaid: number
  payoffOrder: { id: string; name: string; month: number }[]
  // Ay sonu toplam borç
  timeline: number[]
}

const MAX_MONTHS = 360

function minFor(d: Debt, balance: number): number {
  const m = d.minPct ? Math.max(balance * d.minPct, Math.min(balance, 100)) : d.minPayment
  return Math.min(m, balance)
}

// Sabit aylık bütçeyle borç kapatma simülasyonu. Bütçe = başlangıçtaki asgari toplamı + ekstra.
// Kapanan borcun asgarisi sıradaki hedefe akar (bütçe sabit kaldığı için kendiliğinden).
export function simulate(debts: Debt[], extraMonthly: number, strategy: Strategy): StrategyResult {
  const active = debts.filter(d => d.balance > 0.5)
  const balances = new Map(active.map(d => [d.id, d.balance]))
  const budget = active.reduce((s, d) => s + minFor(d, d.balance), 0) + (strategy === 'minimum' ? 0 : extraMonthly)
  const timeline: number[] = []
  const payoffOrder: StrategyResult['payoffOrder'] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  const order = () =>
    active
      .filter(d => (balances.get(d.id) ?? 0) > 0.005)
      .sort((a, b) =>
        strategy === 'snowball'
          ? (balances.get(a.id)! - balances.get(b.id)!)
          : b.monthlyRatePct - a.monthlyRatePct,
      )

  while (order().length && month < MAX_MONTHS) {
    month++
    for (const d of active) {
      const bal = balances.get(d.id)!
      if (bal <= 0.005) continue
      const interest = bal * (d.monthlyRatePct / 100)
      totalInterest += interest
      balances.set(d.id, bal + interest)
    }

    let available = strategy === 'minimum' ? Infinity : budget
    for (const d of active) {
      const bal = balances.get(d.id)!
      if (bal <= 0.005) continue
      const pay = Math.min(minFor(d, bal), available)
      balances.set(d.id, bal - pay)
      available -= pay
      totalPaid += pay
    }
    if (strategy !== 'minimum') {
      for (const d of order()) {
        if (available <= 0) break
        const bal = balances.get(d.id)!
        const pay = Math.min(bal, available)
        balances.set(d.id, bal - pay)
        available -= pay
        totalPaid += pay
      }
    }

    for (const d of active) {
      if (balances.get(d.id)! <= 0.005 && !payoffOrder.some(p => p.id === d.id)) {
        balances.set(d.id, 0)
        payoffOrder.push({ id: d.id, name: d.name, month })
      }
    }
    timeline.push([...balances.values()].reduce((a, b) => a + b, 0))
  }

  return {
    strategy,
    feasible: order().length === 0,
    months: month,
    totalInterest,
    totalPaid,
    payoffOrder,
    timeline,
  }
}

export function compareStrategies(debts: Debt[], extraMonthly: number) {
  return {
    minimum: simulate(debts, 0, 'minimum'),
    avalanche: simulate(debts, extraMonthly, 'avalanche'),
    snowball: simulate(debts, extraMonthly, 'snowball'),
  }
}
