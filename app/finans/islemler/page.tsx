import { TransactionsTable } from '@/components/finans/TransactionsTable'
import { PageHeader } from '@/components/finans/ui'
import { getFinanceSnapshot } from '@/lib/finans/load'

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const { data, snapshot } = await getFinanceSnapshot()
  const saved = sp.ok != null

  return (
    <>
      <PageHeader title="İşlemler" subtitle="Filtrele, kategori düzelt, nakit harcamaları elle ekle." />
      {saved && (
        <div className="mb-4 rounded-xl border border-[#0ca30c]/30 bg-[#0ca30c]/5 px-4 py-3 text-sm">
          Ekstre kaydedildi: {sp.ok} yeni işlem eklendi
          {Number(sp.skip) > 0 && `, ${sp.skip} tekrar eden atlandı`}
          {Number(sp.learned) > 0 && `, ${sp.learned} yeni kategori kuralı öğrenildi`}.
        </div>
      )}
      <TransactionsTable
        transactions={data.transactions}
        categories={data.categories}
        accounts={data.accounts}
        defaultMonth={snapshot.focusMonth}
        currentMonth={snapshot.currentMonth}
      />
    </>
  )
}
