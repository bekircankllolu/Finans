import Link from 'next/link'
import { FileUp, Sparkles } from 'lucide-react'
import { AlertList } from '@/components/finans/AlertList'
import { CategoryBars } from '@/components/finans/CategoryBars'
import { ForecastChart, IncomeExpenseChart } from '@/components/finans/LazyCharts'
import { Badge, buttonClass, Card, Empty, Money, PageHeader, Progress, Stat } from '@/components/finans/ui'
import { diffDays } from '@/lib/finans/calc/dates'
import { formatDateTR, formatMonthLong, formatTRY } from '@/lib/finans/format'
import { getFinanceSnapshot } from '@/lib/finans/load'

export default async function FinansDashboard() {
  const { data, snapshot: s } = await getFinanceSnapshot()
  const hasData = data.transactions.length > 0 || data.accounts.length > 0

  if (!hasData) {
    return (
      <>
        <PageHeader title="Finansal Özet" />
        <Card>
          <Empty title="Başlamak için ilk ekstreni yükle" href="/finans/yukle" cta="Ekstre yükle">
            PDF, Excel/CSV veya ekran görüntüsü yükleyebilirsin. AI işlemleri okuyup kategorize eder, sen onaylarsın.
            Daha isabetli tahmin için Ayarlar’dan gelir kaynaklarını ve kredilerini de ekle.
          </Empty>
        </Card>
      </>
    )
  }

  const upcoming = [
    ...s.cards
      .filter(c => c.dueDate && c.balance > 0)
      .map(c => ({ key: c.account.id, label: c.account.name, sub: `Asgari ${formatTRY(c.minPayment)}`, date: c.dueDate!, amount: c.statementDebt ?? c.balance })),
    ...s.loans
      .filter(l => l.nextDue)
      .map(l => ({ key: l.loan.id, label: l.loan.name, sub: `${l.nextDue!.no}/${l.installments.length}. taksit`, date: l.nextDue!.due_date, amount: l.nextDue!.total })),
  ]
    .filter(u => diffDays(s.today, u.date) >= 0 && diffDays(s.today, u.date) <= 35)
    .sort((a, b) => a.date.localeCompare(b.date))

  const healthTone = s.health.score >= 70 ? 'good' : s.health.score >= 45 ? 'warning' : 'critical'
  const totalDebt = s.netWorth.liabilities

  return (
    <>
      <PageHeader
        title="Finansal Özet"
        subtitle={<>Odak ay: {formatMonthLong(s.focusMonth)} · son yüklenen ekstrelere göre</>}
        actions={
          <>
            <Link href="/finans/yukle" className={buttonClass.ghost}>
              <FileUp className="w-4 h-4" /> Ekstre yükle
            </Link>
            <Link href="/finans/raporlar" className={buttonClass.primary}>
              <Sparkles className="w-4 h-4" /> AI rapor
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat
          label="Net değer"
          value={<Money value={s.netWorth.netWorth} />}
          hint={`Varlık ${formatTRY(s.netWorth.assets)}`}
        />
        <Stat
          label={`Gelir · ${formatMonthLong(s.focusMonth)}`}
          value={<Money value={s.focus.income} />}
          delta={s.focusPrev ? s.focus.income - s.focusPrev.income : null}
          hint="önceki aya göre"
        />
        <Stat
          label={`Gider · ${formatMonthLong(s.focusMonth)}`}
          value={<Money value={s.focus.expense} />}
          delta={s.focusPrev ? s.focus.expense - s.focusPrev.expense : null}
          deltaGoodWhenUp={false}
          hint="önceki aya göre"
        />
        <Stat
          label="Toplam borç"
          value={<Money value={totalDebt} />}
          hint={`Kart ${formatTRY(s.netWorth.cardDebt)} · Kredi ${formatTRY(s.netWorth.loanDebt)}`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Finansal sağlık" action={<Badge tone={healthTone}>{s.health.score}/100</Badge>}>
          <div className="text-4xl font-semibold mb-4 tabular-nums">{s.health.score}</div>
          <ul className="space-y-3">
            {s.health.factors.map(f => (
              <li key={f.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{f.label}</span>
                  <span className="text-[#C3C2CF] tabular-nums">{f.value}</span>
                </div>
                <Progress value={f.score} tone={f.score >= 0.7 ? 'good' : f.score >= 0.4 ? 'warning' : 'critical'} label={f.label} />
                <div className="text-[11px] text-[#5A5A6E] mt-1">{f.hint}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Dikkat" className="lg:col-span-2" action={s.alerts.length > 5 ? <span className="text-xs text-[#8B8B9E]">{s.alerts.length} uyarı</span> : undefined}>
          <AlertList alerts={s.alerts} limit={6} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Son 12 ay gelir / gider" className="lg:col-span-2">
          <IncomeExpenseChart data={s.months} />
        </Card>
        <Card title={`Harcama dağılımı · ${formatMonthLong(s.focusMonth)}`} action={<Link href="/finans/islemler" className="text-xs text-[#00D4FF]">İşlemler →</Link>}>
          {s.breakdown.length ? <CategoryBars slices={s.breakdown} /> : <p className="text-sm text-[#8B8B9E]">Bu ay gider yok.</p>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="6 aylık nakit akışı tahmini" className="lg:col-span-2" action={<Link href="/finans/butce" className="text-xs text-[#00D4FF]">Detay →</Link>}>
          <ForecastChart data={s.forecast} />
          <p className="text-[11px] text-[#5A5A6E] mt-2">
            Düzenli gelir {formatTRY(s.recurringIncome)} − ortalama harcama {formatTRY(s.baseSpend)} − kredi taksitleri − kart taksitleri. Başlangıç: likit varlık − kart/KMH borcu.
          </p>
        </Card>
        <Card title="Yaklaşan ödemeler (35 gün)">
          {upcoming.length ? (
            <ul className="divide-y divide-white/6">
              {upcoming.map(u => {
                const days = diffDays(s.today, u.date)
                return (
                  <li key={u.key} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{u.label}</div>
                      <div className="text-xs text-[#8B8B9E]">
                        {formatDateTR(u.date)} · {u.sub}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium tabular-nums">{formatTRY(u.amount)}</div>
                      <Badge tone={days <= 3 ? 'critical' : days <= 7 ? 'warning' : 'neutral'}>{days === 0 ? 'bugün' : `${days} gün`}</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-[#8B8B9E]">Önümüzdeki 35 günde kayıtlı ödeme yok.</p>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Hedefler & bütçe" action={<Link href="/finans/butce" className="text-xs text-[#00D4FF]">Yönet →</Link>}>
          {s.goals.length === 0 && s.budgets.length === 0 ? (
            <p className="text-sm text-[#8B8B9E]">Henüz hedef veya bütçe yok.</p>
          ) : (
            <ul className="space-y-3">
              {s.goals.map(g => (
                <li key={g.goal.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{g.goal.name}</span>
                    <span className="text-[#C3C2CF] tabular-nums">
                      {formatTRY(g.goal.current_amount)} / {formatTRY(g.goal.target_amount)}
                    </span>
                  </div>
                  <Progress value={g.ratio} tone="accent" label={g.goal.name} />
                </li>
              ))}
              {s.budgets.map(b => (
                <li key={b.budget.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{b.categoryName} bütçesi</span>
                    <span className="text-[#C3C2CF] tabular-nums">
                      {formatTRY(b.spent)} / {formatTRY(b.budget.monthly_limit)}
                    </span>
                  </div>
                  <Progress value={b.ratio} tone={b.ratio >= 1 ? 'critical' : b.ratio >= 0.8 ? 'warning' : 'good'} label={b.categoryName} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Düzenli ödemeler (abonelik, fatura)">
          {s.recurring.length ? (
            <ul className="divide-y divide-white/6">
              {s.recurring.slice(0, 8).map(r => (
                <li key={r.merchant} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{r.merchant}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatTRY(r.avgAmount)}
                    <span className="text-xs text-[#5A5A6E]"> /ay · yıllık {formatTRY(r.yearlyCost)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#8B8B9E]">En az 3 aylık veri olunca tekrarlayan ödemeler burada listelenir.</p>
          )}
        </Card>
      </div>
    </>
  )
}
