import Link from 'next/link'
import { BudgetEditor } from '@/components/finans/BudgetEditor'
import { ForecastChart } from '@/components/finans/charts'
import { Goals } from '@/components/finans/Goals'
import { Card, PageHeader } from '@/components/finans/ui'
import { formatMonthLong, formatTRY } from '@/lib/finans/format'
import { getFinanceSnapshot } from '@/lib/finans/load'

export default async function BudgetPage() {
  const { data, snapshot: s } = await getFinanceSnapshot()
  const current = s.months.at(-1)!
  const complete = s.months.slice(0, -1).filter(m => m.txCount > 0).slice(-3)
  const budgetByCat = new Map(data.budgets.map(b => [b.category_id, b.monthly_limit]))
  const rows = data.categories
    .filter(c => c.kind === 'expense')
    .map(c => ({
      categoryId: c.id,
      name: c.name,
      spent: current.byCategory[c.id] ?? 0,
      avg3: complete.length ? complete.reduce((a, m) => a + (m.byCategory[c.id] ?? 0), 0) / complete.length : 0,
      limit: budgetByCat.get(c.id) ?? null,
    }))
    .sort((a, b) => b.avg3 - a.avg3 || a.name.localeCompare(b.name, 'tr'))
  const monthlySurplus = s.forecast.length ? s.forecast.reduce((a, f) => a + f.net, 0) / s.forecast.length : 0

  return (
    <>
      <PageHeader title="Bütçe & hedefler" subtitle={`Bu ay: ${formatMonthLong(s.currentMonth)}`} />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="6 aylık nakit akışı" className="lg:col-span-2">
          <ForecastChart data={s.forecast} />
          <div className="overflow-x-auto -mx-5 px-5 mt-4">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-[#8B8B9E] border-b border-white/8">
                  <th className="py-2 font-medium">Ay</th>
                  <th className="py-2 font-medium text-right">Gelir</th>
                  <th className="py-2 font-medium text-right">Harcama</th>
                  <th className="py-2 font-medium text-right">Kredi</th>
                  <th className="py-2 font-medium text-right">Kart taksiti</th>
                  <th className="py-2 font-medium text-right">Net</th>
                  <th className="py-2 font-medium text-right">Ay sonu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 tabular-nums">
                {s.forecast.map(f => (
                  <tr key={f.month}>
                    <td className="py-2">{formatMonthLong(f.month)}</td>
                    <td className="py-2 text-right">{formatTRY(f.income)}</td>
                    <td className="py-2 text-right">{formatTRY(f.baseSpend)}</td>
                    <td className="py-2 text-right">{formatTRY(f.loanPayments)}</td>
                    <td className="py-2 text-right">{formatTRY(f.cardInstallments)}</td>
                    <td className={`py-2 text-right ${f.net < 0 ? 'text-[#ec835a]' : ''}`}>{formatTRY(f.net)}</td>
                    <td className={`py-2 text-right font-medium ${f.endBalance < 0 ? 'text-[#ec835a]' : ''}`}>{formatTRY(f.endBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.recurringIncome === 0 && (
            <p className="text-xs text-[#fab219] mt-3">
              Düzenli gelir tanımlı değil; tahmin eksik. <Link href="/finans/ayarlar" className="underline">Ayarlar’dan maaş/gelir ekle</Link>.
            </p>
          )}
        </Card>
        <Card title="Birikim hedefleri">
          <Goals goals={s.goals} monthlySurplus={monthlySurplus} />
        </Card>
      </div>

      <Card title="Kategori bütçeleri">
        <BudgetEditor rows={rows} />
      </Card>
    </>
  )
}
