import { DebtSimulator } from '@/components/finans/DebtSimulator'
import { DeleteLoanButton, InstallmentTable } from '@/components/finans/LoanActions'
import { LoanForm } from '@/components/finans/LoanForm'
import { Badge, Card, Money, PageHeader, Progress, Stat } from '@/components/finans/ui'
import { DEFAULT_CARD_RATE } from '@/lib/finans/calc/snapshot'
import { diffDays } from '@/lib/finans/calc/dates'
import { formatDateTR, formatMonthLong, formatMonthShort, formatTRY } from '@/lib/finans/format'
import { getFinanceSnapshot } from '@/lib/finans/load'

export default async function DebtsPage() {
  const { snapshot: s } = await getFinanceSnapshot()
  const monthlyService = s.cards.reduce((a, c) => a + c.minPayment, 0) + s.loans.reduce((a, l) => a + l.monthlyPayment, 0) + s.installments.reduce((a, p) => a + (p.months[0] === s.currentMonth ? p.monthlyAmount : 0), 0)
  const totalLimit = s.cards.reduce((a, c) => a + (c.limit ?? 0), 0)
  const cardDebt = s.cards.reduce((a, c) => a + c.balance, 0)
  const remainingInterest = s.loans.reduce((a, l) => a + l.remainingInterest, 0)
  const installmentMonths = [...new Set(s.installments.flatMap(p => p.months))].sort().slice(0, 6)

  return (
    <>
      <PageHeader title="Borçlar" subtitle="Kredi kartları, KMH, krediler ve taksitler tek yerde." actions={<LoanForm />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Toplam borç" value={<Money value={s.netWorth.liabilities} />} />
        <Stat label="Aylık borç servisi" value={<Money value={monthlyService} />} hint="asgari + kredi + kart taksiti" />
        <Stat label="Kart limit kullanımı" value={totalLimit ? `%${Math.round((cardDebt / totalLimit) * 100)}` : '—'} hint={totalLimit ? `${formatTRY(cardDebt)} / ${formatTRY(totalLimit)}` : undefined} />
        <Stat label="Kalan kredi faizi + vergi" value={<Money value={remainingInterest} />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Kredi kartları">
          {s.cards.length === 0 ? (
            <p className="text-sm text-muted">Kayıtlı kredi kartı yok. Kart ekstresi yüklediğinde otomatik eklenir.</p>
          ) : (
            <ul className="space-y-4">
              {s.cards.map(c => {
                const days = c.dueDate ? diffDays(s.today, c.dueDate) : null
                return (
                  <li key={c.account.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {c.account.name} {c.account.last4 && <span className="text-faint">•{c.account.last4}</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {c.account.bank ?? ''} · aylık faiz %{(c.account.monthly_rate ?? DEFAULT_CARD_RATE).toLocaleString('tr-TR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">{formatTRY(c.balance)}</div>
                        {c.dueDate && (
                          <div className="text-xs text-muted">
                            Son ödeme {formatDateTR(c.dueDate)}{' '}
                            {days != null && days >= 0 && days <= 7 && <Badge tone={days <= 2 ? 'critical' : 'warning'}>{days} gün</Badge>}
                          </div>
                        )}
                      </div>
                    </div>
                    {c.limit != null && (
                      <div className="mt-2">
                        <Progress
                          value={c.utilization ?? 0}
                          tone={(c.utilization ?? 0) >= 0.8 ? 'critical' : (c.utilization ?? 0) >= 0.5 ? 'warning' : 'good'}
                          label={`${c.account.name} limit kullanımı`}
                        />
                        <div className="flex justify-between text-[11px] text-faint mt-1">
                          <span>Limit {formatTRY(c.limit)} · %{Math.round((c.utilization ?? 0) * 100)} dolu</span>
                          <span>Asgari {formatTRY(c.minPayment)}</span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {s.kmh.length > 0 && (
            <div className="mt-5 pt-4 border-t border-line">
              <div className="text-xs text-muted mb-2">KMH (kredili mevduat)</div>
              {s.kmh.map(a => (
                <div key={a.id} className="flex justify-between text-sm py-1">
                  <span>{a.name}</span>
                  <span className="tabular-nums">{formatTRY(a.balance)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-faint mt-4">
            Asgari ödeme yaparsan kalan borca akdi faiz + KKDF/BSMV işler. Mümkünse dönem borcunun tamamını öde.
          </p>
        </Card>

        <Card title="Kart taksitleri">
          {s.installments.length === 0 ? (
            <p className="text-sm text-muted">Ekstrelerde devam eden taksitli alışveriş yok.</p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-2 font-medium">İşyeri</th>
                      <th className="py-2 font-medium text-right">Aylık</th>
                      <th className="py-2 font-medium text-right">Kalan</th>
                      <th className="py-2 font-medium text-right">Bitiş</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.installments.map(p => (
                      <tr key={p.key}>
                        <td className="py-2 pr-3 truncate max-w-[180px]">{p.merchant}</td>
                        <td className="py-2 text-right tabular-nums">{formatTRY(p.monthlyAmount)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {p.remainingCount} × = {formatTRY(p.remainingAmount)}
                        </td>
                        <td className="py-2 text-right text-muted">{formatMonthShort(p.endMonth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {installmentMonths.map(m => {
                  const sum = s.installments.reduce((a, p) => a + (p.months.includes(m) ? p.monthlyAmount : 0), 0)
                  return (
                    <div key={m} className="rounded-lg bg-surface-2 p-2 text-center">
                      <div className="text-[11px] text-muted">{formatMonthShort(m)}</div>
                      <div className="text-xs font-medium tabular-nums">{formatTRY(sum)}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Krediler" className="mb-4">
        {s.loans.length === 0 ? (
          <p className="text-sm text-muted">Kayıtlı kredi yok. Ödeme planı PDF’ini yükle veya “Kredi ekle” ile gir.</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {s.loans.map(l => (
              <div key={l.loan.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{l.loan.name}</div>
                    <div className="text-xs text-muted">
                      {l.loan.bank ?? ''} · aylık %{l.loan.monthly_rate.toLocaleString('tr-TR')} · {formatTRY(l.loan.principal)} çekildi
                    </div>
                  </div>
                  <DeleteLoanButton id={l.loan.id} />
                </div>
                <div className="mt-3">
                  <Progress value={l.progress} tone="accent" label={`${l.loan.name} ödeme ilerlemesi`} />
                  <div className="flex justify-between text-[11px] text-faint mt-1">
                    <span>
                      {l.paidCount}/{l.installments.length} taksit ödendi
                    </span>
                    <span>Bitiş {l.endDate ? formatDateTR(l.endDate) : '—'}</span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3">
                  <div>
                    <dt className="text-xs text-muted">Aylık taksit</dt>
                    <dd className="tabular-nums">{formatTRY(l.monthlyPayment)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Sonraki vade</dt>
                    <dd>{l.nextDue ? formatDateTR(l.nextDue.due_date) : 'Bitti'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Kalan anapara</dt>
                    <dd className="tabular-nums">{formatTRY(l.remainingPrincipal)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Kalan faiz + vergi</dt>
                    <dd className="tabular-nums">{formatTRY(l.remainingInterest)}</dd>
                  </div>
                </dl>
                {l.remainingCount > 0 && (
                  <div className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
                    Bugün kapatırsan ≈ <strong>{formatTRY(l.earlyPayoffAmount)}</strong> (erken ödeme tazminatı dahil) ödersin; kalan taksit toplamına göre ≈{' '}
                    <strong>{formatTRY(l.earlyPayoffSavings)}</strong> tasarruf. Kesin tutarı bankandan teyit et.
                  </div>
                )}
                <details className="mt-3">
                  <summary className="text-xs text-accent cursor-pointer">Ödeme planı</summary>
                  <InstallmentTable loanId={l.loan.id} installments={l.installments} />
                </details>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Borç kapatma stratejisi">
        <DebtSimulator debts={s.debts} suggestedExtra={s.suggestedExtra} />
        <p className="text-[11px] text-faint mt-2">Hesap tarihi: {formatMonthLong(s.currentMonth)}.</p>
      </Card>
    </>
  )
}
