import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewLoan } from '@/components/finans/ReviewLoan'
import { ReviewStatement } from '@/components/finans/ReviewStatement'
import { RetryParse } from '@/components/finans/RetryParse'
import { DocumentViewer } from '@/components/finans/DocumentViewer'
import { Stepper } from '@/components/finans/Stepper'
import { buttonClass, Card, PageHeader } from '@/components/finans/ui'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import type { StoredStatement } from '@/lib/finans/statementJobs'
import type { DraftLoanSchedule } from '@/lib/finans/types'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getFinanceContext()
  const { data: st, error } = await supabase.from('fin_statements').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!st) notFound()
  const { data } = await getFinanceSnapshot()

  const back = (
    <Link href="/finans/yukle" className={buttonClass.ghost}>
      ← Ekstreler
    </Link>
  )

  if (st.status === 'confirmed') {
    const account = data.accounts.find(a => a.id === st.account_id)
    const details = [
      ['Dosya adı', st.file_name],
      ['Banka', st.bank ?? '—'],
      ['Hesap', account?.name ?? '—'],
      ['Belge türü', st.kind === 'loan_schedule' ? 'Kredi ödeme planı' : account?.type === 'credit_card' ? 'Kredi kartı ekstresi' : 'Hesap ekstresi'],
      ['Dönem başlangıcı', formatDateTR(st.period_start)],
      ['Dönem sonu', formatDateTR(st.period_end)],
      ['Yükleme tarihi', formatDateTR(st.created_at)],
      ['Kaydedilme tarihi', formatDateTR(st.confirmed_at)],
      ['Son ödeme tarihi', formatDateTR(st.due_date)],
      ...(st.total_debt != null ? [['Dönem borcu', formatTRY(Number(st.total_debt), true)]] : []),
      ...(st.closing_balance != null ? [['Kapanış bakiyesi', formatTRY(Number(st.closing_balance), true)]] : []),
    ]
    return (
      <>
        <PageHeader title={account?.name ?? st.bank ?? 'Ekstre detayı'} subtitle={st.file_name} actions={back} />
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <Card title="Orijinal belge" className="lg:col-span-2" padded={false}>
            <div className="h-[70vh] min-h-[360px]">
              <DocumentViewer key={st.id} statementId={st.id} mimeType={st.mime_type} />
            </div>
          </Card>
          <Card title="Ekstre bilgileri">
            <dl className="space-y-3 text-sm">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted mt-4">Bu belge kaydedildi. Orijinal dosyayı görüntüleyebilir veya yeni sekmede açabilirsin.</p>
            <Link href={st.kind === 'loan_schedule' ? '/finans/borclar' : `/finans/islemler?ekstre=${st.id}`} className={`${buttonClass.primary} mt-4`}>
              {st.kind === 'loan_schedule' ? 'Kredileri gör' : 'Ekstre işlemlerini gör'}
            </Link>
          </Card>
        </div>
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
