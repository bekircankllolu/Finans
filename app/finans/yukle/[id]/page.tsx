import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewLoan } from '@/components/finans/ReviewLoan'
import { ReviewStatement } from '@/components/finans/ReviewStatement'
import { RetryParse } from '@/components/finans/RetryParse'
import { Stepper } from '@/components/finans/Stepper'
import { buttonClass, Card, Empty, PageHeader } from '@/components/finans/ui'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'
import type { StoredStatement } from '@/lib/finans/statementJobs'
import type { DraftLoanSchedule } from '@/lib/finans/types'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getFinanceContext()
  const { data: st } = await supabase.from('fin_statements').select('*').eq('id', id).maybeSingle()
  if (!st) notFound()
  const { data } = await getFinanceSnapshot()

  const back = (
    <Link href="/finans/yukle" className={buttonClass.ghost}>
      ← Ekstreler
    </Link>
  )

  if (st.status === 'confirmed') {
    return (
      <>
        <PageHeader title={st.file_name} actions={back} />
        <Stepper current={3} />
        <Card>
          <Empty title="Bu ekstre kaydedildi" href={`/finans/islemler?ekstre=${st.id}`} cta="İşlemlerini gör" />
        </Card>
      </>
    )
  }

  const stored = st.parsed as (StoredStatement & DraftLoanSchedule) | null
  // Eski sürümle okunmuş taslaklarda doğrulama bilgisi yok; yeniden okutmak gerekir
  const ready = st.status === 'parsed' && stored && (st.kind === 'loan_schedule' ? Array.isArray(stored.installments) : !!stored.draft)

  if (!ready) {
    return (
      <>
        <PageHeader title={st.file_name} actions={back} />
        <Stepper current={1} />
        <Card>
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted max-w-md mx-auto">
              {st.status === 'failed'
                ? `Okuma başarısız: ${st.error}`
                : st.status === 'parsing'
                  ? 'Belge şu an okunuyor. Birkaç dakika sürebilir; sayfayı yenileyerek kontrol edebilirsin.'
                  : st.status === 'parsed'
                    ? 'Bu belge eski sürümle okunmuş. Toplam kontrolü ve yeni özellikler için yeniden okut.'
                    : 'Belge henüz okunmadı.'}
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
        subtitle="AI’nın okuduğunu soldaki orijinal belgeyle karşılaştır; yanlış satırı düzelt, eksik satırı ekle."
        actions={back}
      />
      {st.kind === 'loan_schedule' ? (
        <>
          <Stepper current={2} />
          <ReviewLoan statementId={st.id} draft={stored as DraftLoanSchedule} />
        </>
      ) : (
        <ReviewStatement
          statementId={st.id}
          mimeType={st.mime_type}
          draft={stored!.draft}
          accounts={data.accounts.filter(a => a.is_active)}
          categories={data.categories}
          initialAccountId={st.account_id}
        />
      )}
    </>
  )
}
