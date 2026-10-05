import type { Account } from '../types'
import { formatDateTR, formatMonthLong, formatTRY } from '../format'
import type { CategorySlice, MonthSummary } from './cashflow'
import { diffDays, monthKey } from './dates'
import type { ForecastMonth } from './forecast'
import type { LoanStatus } from './loans'
import type { RecurringPayment } from './recurring'
import type { BudgetProgress, CardSummary } from './snapshot'

export type AlertSeverity = 'danger' | 'warning' | 'info'

export interface Alert {
  key: string
  severity: AlertSeverity
  title: string
  message: string
  href?: string
}

interface AlertInput {
  today: string
  currentMonth: string
  focus: MonthSummary
  breakdown: CategorySlice[]
  cards: CardSummary[]
  kmh: Account[]
  loans: LoanStatus[]
  budgets: BudgetProgress[]
  forecast: ForecastMonth[]
  recurring: RecurringPayment[]
  accounts: Account[]
  lastStatementByAccount: Map<string, string | null>
}

const ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 }

export function buildAlerts(i: AlertInput): Alert[] {
  const alerts: Alert[] = []

  for (const c of i.cards) {
    if (c.dueDate && c.balance > 0) {
      const days = diffDays(i.today, c.dueDate)
      if (days >= 0 && days <= 5) {
        alerts.push({
          key: `due:${c.account.id}:${c.dueDate}`,
          severity: days <= 1 ? 'danger' : 'warning',
          title: `${c.account.name} son ödeme ${days === 0 ? 'bugün' : `${days} gün sonra`}`,
          message: `Borç ${formatTRY(c.statementDebt ?? c.balance)}, asgari ${formatTRY(c.minPayment)}. Asgari ödeme yaparsan kalan borca akdi faiz + KKDF/BSMV işler.`,
          href: '/finans/borclar',
        })
      }
    }
    if (c.utilization != null && c.utilization >= 0.8) {
      alerts.push({
        key: `util:${c.account.id}:${i.currentMonth}`,
        severity: 'warning',
        title: `${c.account.name} limitinin %${Math.round(c.utilization * 100)}’i dolu`,
        message: 'Yüksek limit kullanımı kredi notunu düşürür. Yeni taksitli alışverişten kaçın.',
        href: '/finans/borclar',
      })
    }
  }

  for (const a of i.kmh) {
    alerts.push({
      key: `kmh:${a.id}:${i.currentMonth}`,
      severity: 'warning',
      title: `${a.name} KMH kullanımda: ${formatTRY(a.balance)}`,
      message: 'KMH, kart faizi seviyesinde günlük faiz işletir. Öncelikli kapatılacak borçlar arasında.',
      href: '/finans/borclar',
    })
  }

  for (const l of i.loans) {
    if (!l.nextDue) continue
    const days = diffDays(i.today, l.nextDue.due_date)
    if (days >= 0 && days <= 5) {
      alerts.push({
        key: `loan:${l.loan.id}:${l.nextDue.due_date}`,
        severity: 'info',
        title: `${l.loan.name} taksiti ${formatDateTR(l.nextDue.due_date)}`,
        message: `${l.nextDue.no}. taksit: ${formatTRY(l.nextDue.total)}. Hesapta yeterli bakiye olduğundan emin ol.`,
        href: '/finans/borclar',
      })
    }
  }

  for (const b of i.budgets) {
    if (b.ratio >= 1) {
      alerts.push({
        key: `budget:${b.budget.category_id}:${i.currentMonth}:over`,
        severity: 'danger',
        title: `${b.categoryName} bütçesi aşıldı`,
        message: `${formatTRY(b.spent)} / ${formatTRY(b.budget.monthly_limit)} harcandı.`,
        href: '/finans/butce',
      })
    } else if (b.ratio >= 0.8 || b.projected > b.budget.monthly_limit) {
      alerts.push({
        key: `budget:${b.budget.category_id}:${i.currentMonth}:near`,
        severity: 'warning',
        title: `${b.categoryName} bütçesinin %${Math.round(b.ratio * 100)}’i kullanıldı`,
        message: `Bu hızla ay sonunda ${formatTRY(b.projected)} olacak (limit ${formatTRY(b.budget.monthly_limit)}).`,
        href: '/finans/butce',
      })
    }
  }

  for (const s of i.breakdown) {
    if (s.avg3 > 0 && s.amount > s.avg3 * 1.5 && s.amount - s.avg3 > 1000) {
      alerts.push({
        key: `spike:${s.categoryId}:${i.focus.month}`,
        severity: 'info',
        title: `${s.name} harcaması ortalamanın ${(s.amount / s.avg3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} katı`,
        message: `${formatTRY(s.amount)} (3 ay ort. ${formatTRY(s.avg3)}). Fark: ${formatTRY(s.amount - s.avg3)}.`,
        href: '/finans/islemler',
      })
    }
  }

  if (i.focus.txCount > 0 && i.focus.income > 0 && i.focus.net < 0) {
    alerts.push({
      key: `negative:${i.focus.month}`,
      severity: 'warning',
      title: 'Gider gelirden fazla',
      message: `Son ayda ${formatTRY(-i.focus.net)} açık verdin. Borç büyümeden kesilebilecek kalemlere bak.`,
    })
  }

  const negative = i.forecast.find(f => f.endBalance < 0)
  if (negative) {
    alerts.push({
      key: `forecast:${negative.month}`,
      severity: 'danger',
      title: 'Nakit akışı eksiye düşüyor',
      message: `Mevcut gidişle ${formatMonthLong(negative.month)} sonunda net nakit ${formatTRY(negative.endBalance)} olacak (kart/KMH borcu düşülmüş haliyle).`,
      href: '/finans/butce',
    })
  }

  const recurringTotal = i.recurring.reduce((s, r) => s + r.avgAmount, 0)
  if (i.recurring.length >= 3) {
    alerts.push({
      key: `recurring:${i.currentMonth}`,
      severity: 'info',
      title: `${i.recurring.length} düzenli ödeme: aylık ${formatTRY(recurringTotal)}`,
      message: `Yıllık ${formatTRY(recurringTotal * 12)}. Kullanmadığın abonelikleri iptal etmeyi düşün.`,
      href: '/finans/islemler',
    })
  }

  for (const a of i.accounts) {
    if (!a.is_active || (a.type !== 'credit_card' && a.type !== 'checking')) continue
    const last = i.lastStatementByAccount.get(a.id)
    if (!last || diffDays(last, i.today) > 40) {
      alerts.push({
        key: `stale:${a.id}:${monthKey(i.today)}`,
        severity: 'info',
        title: `${a.name} için güncel ekstre yok`,
        message: last ? `Son ekstre dönemi ${formatDateTR(last)}.` : 'Henüz ekstre yüklenmedi.',
        href: '/finans/yukle',
      })
    }
  }

  return alerts.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
