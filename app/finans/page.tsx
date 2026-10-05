import Link from 'next/link'
import { ArrowRight, FileUp, Sparkles } from 'lucide-react'
import { AlertList } from '@/components/finans/AlertList'
import { ForecastChart, IncomeExpenseChart } from '@/components/finans/LazyCharts'
import { PeriodPicker } from '@/components/finans/PeriodPicker'
import { Badge, BankMark, buttonClass, Card, Empty, Money, PageHeader, Progress, Section, Stat } from '@/components/finans/ui'
import { addMonths, diffDays, monthKey } from '@/lib/finans/calc/dates'
import { monthsWithData, summarizePeriod, type PeriodMode } from '@/lib/finans/calc/period'
import { DEFAULT_CARD_RATE } from '@/lib/finans/calc/snapshot'
import { ACCOUNT_TYPE_LABELS } from '@/lib/finans/defaults'
import { formatDateTR, formatMonthLong, formatPct, formatTRY } from '@/lib/finans/format'
import { getFinanceSnapshot } from '@/lib/finans/load'
import { cn } from '@/lib/utils'

const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

export default async function FinansDashboard({ searchParams }: { searchParams: Promise<{ ay?: string; mod?: string }> }) {
  const sp = await searchParams
  const { data, snapshot: s } = await getFinanceSnapshot()

  if (data.transactions.length === 0 && data.accounts.length === 0) {
    return (
      <>
        <PageHeader title="Özet" />
        <Card>
          <Empty title="Başlamak için ilk ekstreni yükle" href="/finans/yukle" cta="Ekstre yükle">
            PDF, Excel/CSV veya ekran görüntüsü yükleyebilirsin. AI işlemleri okur, toplamları ekstreyle karşılaştırır, sen onaylarsın. Daha isabetli
            tahmin için Ayarlar’dan gelir kaynaklarını ve kredilerini de ekle.
          </Empty>
        </Card>
      </>
    )
  }

  const months = monthsWithData(data.transactions)
  const max = months[0] ?? s.currentMonth
  const min = months.at(-1) ?? s.currentMonth
  const month = sp.ay && /^\d{4}-\d{2}$/.test(sp.ay) ? sp.ay : s.focusMonth
  const mode: PeriodMode = sp.mod === 'kart' ? 'card' : 'month'
  const sel = { month, mode }
  const cur = summarizePeriod(data.transactions, data.categories, data.accounts, data.statements, sel)
  const prev = summarizePeriod(data.transactions, data.categories, data.accounts, data.statements, { month: addMonths(month, -1), mode })
  const prevByCat = new Map(prev.byCategory.map(c => [c.categoryId, c.amount]))
  const cardInfo = new Map(s.cards.map(c => [c.account.id, c]))

  const upcoming = [
    ...s.cards
      .filter(c => c.dueDate && c.balance > 0)
      .map(c => ({ key: c.account.id, label: c.account.name, sub: `Asgari ${formatTRY(c.minPayment)}`, date: c.dueDate!, amount: c.statementDebt ?? c.balance, kind: 'Kart' })),
    ...s.loans.flatMap(l =>
      l.installments
        .filter(i => !i.paid)
        .slice(0, 2)
        .map(i => ({ key: `${l.loan.id}-${i.no}`, label: l.loan.name, sub: `${i.no}/${l.installments.length}. taksit`, date: i.due_date, amount: i.total, kind: 'Kredi' })),
    ),
  ]
    .filter(u => diffDays(s.today, u.date) >= 0 && diffDays(s.today, u.date) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date))
  const dueIn30 = upcoming.reduce((a, u) => a + u.amount, 0)

  const debts = [
    ...s.cards.map(c => ({
      key: c.account.id,
      name: c.account.name,
      kind: 'Kredi kartı',
      bank: c.account.bank,
      balance: c.balance,
      rate: c.account.monthly_rate ?? DEFAULT_CARD_RATE,
      monthly: c.minPayment,
      monthlyLabel: 'asgari',
      due: c.dueDate,
      util: c.utilization,
    })),
    ...s.kmh.map(a => ({ key: a.id, name: a.name, kind: 'KMH', bank: a.bank, balance: a.balance, rate: a.monthly_rate ?? DEFAULT_CARD_RATE, monthly: null, monthlyLabel: '', due: null, util: null })),
    ...s.loans
      .filter(l => l.remainingCount > 0)
      .map(l => ({
        key: l.loan.id,
        name: l.loan.name,
        kind: `Kredi · ${l.remainingCount} taksit kaldı`,
        bank: l.loan.bank,
        balance: l.remainingPrincipal,
        rate: l.loan.monthly_rate,
        monthly: l.monthlyPayment,
        monthlyLabel: 'taksit',
        due: l.nextDue?.due_date ?? null,
        util: null,
      })),
  ]

  const healthTone = s.health.score >= 70 ? 'good' : s.health.score >= 45 ? 'warning' : 'critical'
  const periodLabel =
    mode === 'card' ? `${formatMonthLong(month)} · kartlar hesap kesim dönemine göre` : `${formatMonthLong(month)} · ayın 1’i – son günü`
  const splitTotal = cur.split.fixed + cur.split.variable + cur.split.installments + cur.split.bankCosts || 1

  return (
    <>
      <PageHeader
        title="Özet"
        subtitle={periodLabel}
        actions={
          <>
            <PeriodPicker month={month} mode={mode} min={min} max={max >= s.currentMonth ? max : s.currentMonth} />
            <Link href="/finans/yukle" className={buttonClass.primary}>
              <FileUp className="w-4 h-4" /> Ekstre yükle
            </Link>
          </>
        }
      />

      {/* 1. Durum şeridi */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8 lg:mb-10">
        <Stat label="Gelir" value={<Money value={cur.income} />} delta={cur.income - prev.income} />
        <Stat label="Gider" value={<Money value={cur.expense} />} delta={cur.expense - prev.expense} deltaGoodWhenUp={false} />
        <Stat
          label="Net"
          value={<Money value={cur.net} signed />}
          tone={cur.net < 0 ? 'crit' : undefined}
          hint={cur.savingsRate != null ? `Tasarruf oranı ${formatPct(cur.savingsRate)}` : 'Bu dönem gelir yok'}
        />
        <Stat label="Toplam borç" value={<Money value={s.netWorth.liabilities} />} hint={`Kart ${formatTRY(s.netWorth.cardDebt)} · Kredi ${formatTRY(s.netWorth.loanDebt)}`} />
        <Stat label="30 günde ödenecek" value={<Money value={dueIn30} />} hint={`${upcoming.length} ödeme`} />
        <Stat label="Net değer" value={<Money value={s.netWorth.netWorth} />} hint={`Varlık ${formatTRY(s.netWorth.assets)}`} tone={s.netWorth.netWorth < 0 ? 'crit' : undefined} />
      </div>

      {/* 2. Nereye harcadım */}
      <Section
        title="Nereye harcadım?"
        description={`${cur.txCount} işlem · transferler ve kart ödemeleri hariç`}
        action={
          <Link href={`/finans/islemler?ay=${month}`} className={buttonClass.subtle}>
            Tüm işlemler <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
      >
        <div className="grid lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7" title="Kategoriler">
            {cur.byCategory.length === 0 ? (
              <p className="text-sm text-muted">Bu dönemde gider yok.</p>
            ) : (
              <>
                <ul className="space-y-3.5">
                  {cur.byCategory.slice(0, 10).map(c => {
                    const p = prevByCat.get(c.categoryId) ?? 0
                    const diff = p > 0 ? (c.amount - p) / p : null
                    return (
                      <li key={c.categoryId}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate">{c.name}</span>
                          <span className="flex items-baseline gap-2.5 shrink-0">
                            {diff != null && Math.abs(diff) >= 0.15 && (
                              <span className={cn('text-[11px]', diff > 0 ? 'text-serious' : 'text-good')} title="Önceki döneme göre">
                                {diff > 0 ? '▲' : '▼'} %{Math.round(Math.abs(diff) * 100)}
                              </span>
                            )}
                            <span className="font-medium tabular-nums">{formatTRY(c.amount)}</span>
                            <span className="text-xs text-faint w-9 text-right tabular-nums">%{Math.round(c.share * 100)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 mt-1.5 rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-series-1" style={{ width: `${(c.amount / cur.byCategory[0].amount) * 100}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {cur.byCategory.length > 10 && (
                  <p className="text-xs text-muted mt-3">
                    +{cur.byCategory.length - 10} kategori daha: {formatTRY(cur.byCategory.slice(10).reduce((a, c) => a + c.amount, 0))}
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-4 border-t border-line">
                  {(
                    [
                      ['Sabit giderler', cur.split.fixed],
                      ['Değişken', cur.split.variable],
                      ['Taksitler', cur.split.installments],
                      ['Faiz & ücretler', cur.split.bankCosts],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
                      <div className="text-[11px] text-muted">{label}</div>
                      <div className="text-sm font-medium tabular-nums">{formatTRY(v)}</div>
                      <div className="text-[11px] text-faint tabular-nums">%{Math.round((v / splitTotal) * 100)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="lg:col-span-5" title="En çok harcanan yerler">
            {cur.topMerchants.length === 0 ? (
              <p className="text-sm text-muted">Bu dönemde harcama yok.</p>
            ) : (
              <ol className="divide-y divide-line">
                {cur.topMerchants.map((m, i) => (
                  <li key={m.merchant} className="flex items-center gap-3 py-2">
                    <span className="w-5 text-xs text-faint tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{m.merchant}</div>
                      <div className="text-[11px] text-muted truncate">
                        {m.category ?? 'Kategorisiz'} · {m.count} işlem
                      </div>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{formatTRY(m.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </Section>

      {/* 3. Hesap / kart bazında */}
      <Section title="Banka ve kart bazında" description="Her hesabın bu dönemdeki harcaması, en büyük kalemleri ve borç durumu">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cur.byAccount.map(a => {
            const info = cardInfo.get(a.account.id)
            const isDebt = a.account.type === 'credit_card' || a.account.type === 'kmh'
            return (
              <Card key={a.account.id}>
                <div className="flex items-start gap-3">
                  <BankMark name={a.account.bank ?? a.account.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {a.account.name} {a.account.last4 && <span className="text-faint font-normal">•{a.account.last4}</span>}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {[a.account.bank, ACCOUNT_TYPE_LABELS[a.account.type]].filter(Boolean).join(' · ')} · {shortDate(a.period.start)}–{shortDate(a.period.end)}
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between mt-4">
                  <div>
                    <div className="text-[11px] text-muted">{a.account.type === 'credit_card' ? 'Dönem harcaması' : 'Çıkış'}</div>
                    <div className="text-xl font-semibold tabular-nums tracking-tight">{formatTRY(a.spend)}</div>
                  </div>
                  <div className="text-right text-[11px] text-muted">
                    {a.count} işlem
                    {a.income > 0 && <div className="text-good tabular-nums">+{formatTRY(a.income)} giriş</div>}
                  </div>
                </div>
                {a.topCategories.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {a.topCategories.map(tc => (
                      <li key={tc.name} className="text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-ink-2 truncate">{tc.name}</span>
                          <span className="tabular-nums">{formatTRY(tc.amount)}</span>
                        </div>
                        <Progress value={a.spend ? tc.amount / a.spend : 0} size="sm" label={tc.name} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs">
                  {isDebt ? (
                    <>
                      <span className="text-muted">
                        Borç <span className="text-ink font-medium tabular-nums">{formatTRY(a.account.balance)}</span>
                        {info?.limit ? <> / {formatTRY(info.limit)}</> : null}
                      </span>
                      {info?.dueDate && (
                        <Badge tone={diffDays(s.today, info.dueDate) <= 3 ? 'critical' : 'neutral'}>Son ödeme {formatDateTR(info.dueDate)}</Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">
                      Bakiye <span className={cn('font-medium tabular-nums', a.account.balance < 0 ? 'text-crit' : 'text-ink')}>{formatTRY(a.account.balance)}</span>
                    </span>
                  )}
                </div>
                {info?.utilization != null && (
                  <div className="mt-2">
                    <Progress
                      value={info.utilization}
                      size="sm"
                      tone={info.utilization >= 0.8 ? 'critical' : info.utilization >= 0.5 ? 'warning' : 'good'}
                      label="Limit doluluğu"
                    />
                    <div className="text-[11px] text-faint mt-1">Limitin %{Math.round(info.utilization * 100)}’i kullanılıyor</div>
                  </div>
                )}
              </Card>
            )
          })}
          {cur.unassignedSpend > 0 && (
            <Card>
              <div className="text-sm font-medium">Nakit / hesapsız</div>
              <div className="text-xl font-semibold tabular-nums mt-3">{formatTRY(cur.unassignedSpend)}</div>
              <div className="text-[11px] text-muted mt-1">Elle girilen, hesaba bağlı olmayan harcamalar</div>
            </Card>
          )}
        </div>
      </Section>

      {/* 4. Borçlar ve ödemeler */}
      <Section
        title="Borçlar ve yaklaşan ödemeler"
        action={
          <Link href="/finans/borclar" className={buttonClass.subtle}>
            Borç planı <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
      >
        <div className="grid lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-8" padded={false}>
            {debts.length === 0 ? (
              <p className="text-sm text-muted p-5">Kayıtlı borç yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-3 px-5 font-medium">Borç</th>
                      <th className="py-3 px-2 font-medium text-right">Kalan</th>
                      <th className="py-3 px-2 font-medium text-right">Aylık faiz</th>
                      <th className="py-3 px-2 font-medium text-right">Bu ay</th>
                      <th className="py-3 px-5 font-medium text-right">Vade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {debts.map(d => (
                      <tr key={d.key}>
                        <td className="py-3 px-5">
                          <div className="font-medium truncate max-w-[220px]">{d.name}</div>
                          <div className="text-[11px] text-muted">{[d.bank, d.kind].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="py-3 px-2 text-right tabular-nums font-medium">{formatTRY(d.balance)}</td>
                        <td className="py-3 px-2 text-right tabular-nums text-ink-2">%{d.rate.toLocaleString('tr-TR')}</td>
                        <td className="py-3 px-2 text-right tabular-nums">
                          {d.monthly != null ? (
                            <>
                              {formatTRY(d.monthly)}
                              <div className="text-[11px] text-muted">{d.monthlyLabel}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-5 text-right text-ink-2 whitespace-nowrap">{d.due ? formatDateTR(d.due) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line text-sm">
                      <td className="py-3 px-5 font-medium">Toplam</td>
                      <td className="py-3 px-2 text-right tabular-nums font-semibold">{formatTRY(debts.reduce((a, d) => a + d.balance, 0))}</td>
                      <td />
                      <td className="py-3 px-2 text-right tabular-nums font-medium">{formatTRY(debts.reduce((a, d) => a + (d.monthly ?? 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
          <Card className="lg:col-span-4" title="Önümüzdeki 30 gün">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Kayıtlı ödeme yok.</p>
            ) : (
              <ul className="space-y-1">
                {upcoming.map(u => {
                  const days = diffDays(s.today, u.date)
                  return (
                    <li key={u.key} className="flex items-center gap-3 py-1.5">
                      <div className="w-11 text-center shrink-0 rounded-lg bg-surface-2 py-1">
                        <div className="text-sm font-semibold leading-none tabular-nums">{u.date.slice(8, 10)}</div>
                        <div className="text-[10px] text-muted mt-0.5">{formatMonthLong(monthKey(u.date)).slice(0, 3)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{u.label}</div>
                        <div className="text-[11px] text-muted truncate">
                          {u.kind} · {u.sub}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium tabular-nums">{formatTRY(u.amount)}</div>
                        <div className={cn('text-[11px]', days <= 3 ? 'text-crit' : 'text-muted')}>{days === 0 ? 'bugün' : `${days} gün`}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* 5. Trend */}
      <Section title="Trend" description="Son 12 ay ve önümüzdeki 6 ay">
        <div className="grid lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7" title="Gelir ve gider · 12 ay">
            <IncomeExpenseChart data={s.months} />
          </Card>
          <Card className="lg:col-span-5" title="Nakit akışı tahmini · 6 ay">
            <ForecastChart data={s.forecast} />
            <p className="text-[11px] text-faint mt-2">
              Düzenli gelir {formatTRY(s.recurringIncome)} − ort. harcama {formatTRY(s.baseSpend)} − kredi ve kart taksitleri. Başlangıç: nakit − kart/KMH borcu.
            </p>
          </Card>
        </div>
      </Section>

      {/* 6. Büyük harcamalar + sağlık + uyarılar */}
      <div className="grid lg:grid-cols-12 gap-4 mb-8 lg:mb-10">
        <Card className="lg:col-span-4" title="Dönemin en büyük harcamaları">
          {cur.biggest.length === 0 ? (
            <p className="text-sm text-muted">Harcama yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {cur.biggest.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.merchant}</div>
                    <div className="text-[11px] text-muted">
                      {formatDateTR(t.date)}
                      {t.installment_total && t.installment_total > 1 ? ` · ${t.installment_no}/${t.installment_total} taksit` : ''}
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatTRY(t.amount_try)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-3" title="Finansal sağlık" action={<Badge tone={healthTone}>{s.health.score}/100</Badge>}>
          <ul className="space-y-3">
            {s.health.factors.map(f => (
              <li key={f.key} title={f.hint}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ink-2">{f.label}</span>
                  <span className="tabular-nums">{f.value}</span>
                </div>
                <Progress value={f.score} size="sm" tone={f.score >= 0.7 ? 'good' : f.score >= 0.4 ? 'warning' : 'critical'} label={f.label} />
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-5" title="Dikkat" action={s.alerts.length > 4 ? <span className="text-xs text-muted">{s.alerts.length} uyarı</span> : undefined}>
          <AlertList alerts={s.alerts} limit={4} />
        </Card>
      </div>

      {/* 7. Bütçe, hedef, düzenli ödemeler */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Bütçe ve hedefler"
          action={
            <Link href="/finans/butce" className={buttonClass.subtle}>
              Yönet <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          {s.goals.length === 0 && s.budgets.length === 0 ? (
            <p className="text-sm text-muted">Henüz bütçe veya birikim hedefi yok.</p>
          ) : (
            <ul className="space-y-3">
              {s.budgets.map(b => (
                <li key={b.budget.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{b.categoryName}</span>
                    <span className="text-ink-2 tabular-nums">
                      {formatTRY(b.spent)} / {formatTRY(b.budget.monthly_limit)}
                    </span>
                  </div>
                  <Progress value={b.ratio} tone={b.ratio >= 1 ? 'critical' : b.ratio >= 0.8 ? 'warning' : 'good'} label={b.categoryName} />
                </li>
              ))}
              {s.goals.map(g => (
                <li key={g.goal.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{g.goal.name}</span>
                    <span className="text-ink-2 tabular-nums">
                      {formatTRY(g.goal.current_amount)} / {formatTRY(g.goal.target_amount)}
                    </span>
                  </div>
                  <Progress value={g.ratio} label={g.goal.name} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Düzenli ödemeler (abonelik, fatura, kira)">
          {s.recurring.length === 0 ? (
            <p className="text-sm text-muted">En az 3 aylık veri olunca tekrarlayan ödemeler burada listelenir.</p>
          ) : (
            <ul className="divide-y divide-line">
              {s.recurring.slice(0, 8).map(r => (
                <li key={r.merchant} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{r.merchant}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatTRY(r.avgAmount)}
                    <span className="text-xs text-faint"> /ay · yıllık {formatTRY(r.yearlyCost)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-8 flex justify-center">
        <Link href="/finans/raporlar" className={buttonClass.ghost}>
          <Sparkles className="w-4 h-4" /> Bu dönem için AI raporu
        </Link>
      </div>
    </>
  )
}
