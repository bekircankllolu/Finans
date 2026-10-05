import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewLoan } from '@/components/finans/ReviewLoan'
import { ReviewStatement } from '@/components/finans/ReviewStatement'
import { RetryParse } from '@/components/finans/RetryParse'
import { Card, Empty, PageHeader } from '@/components/finans/ui'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'
import type { DraftLoanSchedule, DraftStatement } from '@/lib/finans/types'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getFinanceContext()
  const { data: st } = await supabase.from('fin_statements').select('*').eq('id', id).maybeSingle()
  if (!st) notFound()
  const { data } = await getFinanceSnapshot()

  const back = (
    <Link href="/finans/yukle" className="text-sm text-[#8B8B9E] hover:text-[#F0F0F5]">
      ← Belgeler
    </Link>
  )

  if (st.status === 'confirmed') {
    return (
      <>
        <PageHeader title={st.file_name} actions={back} />
        <Card>
          <Empty title="Bu belge onaylandı" href="/finans/islemler" cta="İşlemlere git" />
        </Card>
      </>
    )
  }

  if (st.status !== 'parsed' || !st.parsed) {
    return (
      <>
        <PageHeader title={st.file_name} actions={back} />
        <Card>
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-[#8B8B9E]">
              {st.status === 'failed' ? `Okuma başarısız: ${st.error}` : st.status === 'parsing' ? 'Belge şu an okunuyor. Birkaç dakika sürebilir.' : 'Belge henüz okunmadı.'}
            </p>
            <RetryParse id={st.id} />
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Kontrol et ve onayla"
        subtitle={`${st.file_name} · AI’nın okuduklarını kontrol et; yanlış kategori veya tutarı düzelt.`}
        actions={back}
      />
      {st.kind === 'loan_schedule' ? (
        <ReviewLoan statementId={st.id} draft={st.parsed as DraftLoanSchedule} />
      ) : (
        <ReviewStatement
          statementId={st.id}
          draft={st.parsed as DraftStatement}
          accounts={data.accounts.filter(a => a.is_active)}
          categories={data.categories}
          initialAccountId={st.account_id}
        />
      )}
    </>
  )
}
