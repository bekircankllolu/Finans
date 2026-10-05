import { TransactionsTable } from '@/components/finans/TransactionsTable'
import { PageHeader } from '@/components/finans/ui'
import { formatDateTR } from '@/lib/finans/format'
import { getFinanceSnapshot } from '@/lib/finans/load'

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ ay?: string; ekstre?: string }> }) {
  const sp = await searchParams
  const { data, snapshot } = await getFinanceSnapshot()
  const st = sp.ekstre ? data.statements.find(s => s.id === sp.ekstre) : undefined
  const accountName = st?.account_id ? data.accounts.find(a => a.id === st.account_id)?.name : null
  const month = sp.ay && /^\d{4}-\d{2}$/.test(sp.ay) ? sp.ay : snapshot.focusMonth

  return (
    <>
      <PageHeader title="İşlemler" subtitle="Filtrele, kategori düzelt, nakit harcamaları elle ekle." />
      <TransactionsTable
        // Filtre değişince tablo durumu sıfırlansın
        key={`${month}-${st?.id ?? ''}`}
        transactions={data.transactions}
        categories={data.categories}
        accounts={data.accounts}
        defaultMonth={month}
        currentMonth={snapshot.currentMonth}
        statement={st ? { id: st.id, label: [accountName ?? st.bank ?? st.file_name, st.period_end && formatDateTR(st.period_end)].filter(Boolean).join(' · ') } : null}
      />
    </>
  )
}
