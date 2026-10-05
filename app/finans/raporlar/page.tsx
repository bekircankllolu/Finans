import Link from 'next/link'
import { GenerateReport } from '@/components/finans/GenerateReport'
import { Markdown } from '@/components/finans/Markdown'
import { AdvisorTabs } from '@/components/finans/AdvisorTabs'
import { Card, Empty, PageHeader } from '@/components/finans/ui'
import { formatMonthLong, formatTRY } from '@/lib/finans/format'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { ay } = await searchParams
  const { supabase } = await getFinanceContext()
  const { snapshot } = await getFinanceSnapshot()
  const { data: reports } = await supabase.from('fin_reports').select('id, month, content, metrics, created_at').order('month', { ascending: false })
  const list = reports ?? []
  const selected = list.find(r => r.month === ay) ?? list[0]
  const hasFocusReport = list.some(r => r.month === snapshot.focusMonth)

  return (
    <>
      <PageHeader
        title="Danışman"
        subtitle="Ne değişti, nerede kaçak var, ne yapmalısın — hesaplanmış rakamlar üzerinden."
        actions={
          <>
          <AdvisorTabs active="reports" />
          <GenerateReport
            month={snapshot.focusMonth}
            label={hasFocusReport ? `${formatMonthLong(snapshot.focusMonth)} raporunu yenile` : `${formatMonthLong(snapshot.focusMonth)} raporu oluştur`}
          />
          </>
        }
      />
      {!selected ? (
        <Card>
          <Empty title="Henüz rapor yok">Ekstrelerini yükleyip onayladıktan sonra aylık raporu oluştur.</Empty>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-4 gap-4">
          <Card title="Arşiv" className="lg:col-span-1 h-fit">
            <ul className="space-y-1">
              {list.map(r => (
                <li key={r.id}>
                  <Link
                    href={`/finans/raporlar?ay=${r.month}`}
                    className={`block rounded-lg px-2.5 py-2 text-sm ${r.month === selected.month ? 'bg-hover' : 'text-muted hover:bg-hover'}`}
                  >
                    {formatMonthLong(r.month)}
                    {r.metrics?.net != null && (
                      <span className="block text-[11px] text-faint">
                        Net {formatTRY(Number(r.metrics.net))} · Skor {r.metrics.health}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={formatMonthLong(selected.month)} className="lg:col-span-3">
            <Markdown text={selected.content} />
            <p className="text-[11px] text-faint mt-6">
              Oluşturulma: {new Date(selected.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} · Yatırım tavsiyesi değildir.
            </p>
          </Card>
        </div>
      )}
    </>
  )
}
