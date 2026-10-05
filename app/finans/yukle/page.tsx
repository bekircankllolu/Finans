import Link from 'next/link'
import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react'
import { DeleteStatementButton } from '@/components/finans/StatementRowActions'
import { Uploader } from '@/components/finans/Uploader'
import { Badge, BankMark, Card, Empty, PageHeader } from '@/components/finans/ui'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'
import type { Statement } from '@/lib/finans/types'

const STATUS: Record<Statement['status'], { label: string; tone: 'neutral' | 'good' | 'warning' | 'critical' | 'accent' }> = {
  uploaded: { label: 'Okunmadı', tone: 'neutral' },
  parsing: { label: 'Okunuyor', tone: 'accent' },
  parsed: { label: 'Onay bekliyor', tone: 'warning' },
  confirmed: { label: 'Kaydedildi', tone: 'good' },
  failed: { label: 'Hata', tone: 'critical' },
}

function ReconcileMark({ st }: { st: Statement }) {
  if (st.status !== 'confirmed' || !st.reconcile_status) return null
  if (st.reconcile_status === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-good" title="Okunan satırlar ekstrenin toplamlarıyla tutuyor">
        <CheckCircle2 className="w-3.5 h-3.5" /> Toplamlar tuttu
      </span>
    )
  if (st.reconcile_status === 'mismatch')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warn">
        <CircleAlert className="w-3.5 h-3.5" /> {formatTRY(Math.abs(st.reconcile_diff ?? 0), true)} fark
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
      <CircleHelp className="w-3.5 h-3.5" /> Toplam kontrol edilemedi
    </span>
  )
}

export default async function StatementsPage() {
  const { user } = await getFinanceContext()
  const { data } = await getFinanceSnapshot()
  const accountName = new Map(data.accounts.map(a => [a.id, a.name]))
  const pending = data.statements.filter(s => s.status !== 'confirmed')
  const done = data.statements.filter(s => s.status === 'confirmed')

  const row = (st: Statement) => {
    const status = STATUS[st.status]
    const amount = st.total_debt ?? st.closing_balance
    const href = st.status === 'confirmed' ? `/finans/islemler?ekstre=${st.id}` : `/finans/yukle/${st.id}`
    return (
      <li key={st.id} className="flex items-center gap-3 py-3">
        <BankMark name={st.bank ?? (st.account_id ? accountName.get(st.account_id) ?? null : null)} />
        <Link href={href} className="min-w-0 flex-1 group">
          <div className="text-sm font-medium truncate group-hover:text-accent">
            {(st.account_id && accountName.get(st.account_id)) || st.file_name}
          </div>
          <div className="text-[11px] text-muted truncate">
            {st.kind === 'loan_schedule' ? 'Kredi ödeme planı' : st.period_end ? `Dönem sonu ${formatDateTR(st.period_end)}` : st.file_name}
            {amount != null && ` · ${formatTRY(amount)}`}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <ReconcileMark st={st} />
            {st.error && <span className="text-[11px] text-crit truncate max-w-[220px]" title={st.error}>{st.error}</span>}
          </div>
        </Link>
        <DeleteStatementButton id={st.id} confirmed={st.status === 'confirmed'} />
      </li>
    )
  }

  return (
    <>
      <PageHeader title="Ekstreler" subtitle="Kart ve hesap ekstrelerini yükle; AI okur, ekstrenin kendi toplamlarıyla doğrular, sen onaylarsın." />
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 min-w-0">
          <Uploader userId={user.id} accounts={data.accounts.filter(a => a.is_active).map(a => ({ id: a.id, name: a.name }))} />
          <div className="grid sm:grid-cols-3 gap-3 mt-4 text-xs text-muted">
            <div className="rounded-xl border border-line p-3">
              <div className="text-ink font-medium mb-1">Doğrulama</div>
              Önceki borç + harcamalar − ödemeler = dönem borcu denklemi kontrol edilir.
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-ink font-medium mb-1">Tekrar yok</div>
              Aynı ekstre veya çakışan dönem yeniden yüklenirse kayıtlı işlemler atlanır.
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-ink font-medium mb-1">Öğrenir</div>
              Düzelttiğin kategori ve yönler banka bazında kural olarak hatırlanır.
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 space-y-4 min-w-0">
          {pending.length > 0 && (
            <Card title="Onay bekleyenler">
              <ul className="divide-y divide-line -my-3">{pending.map(row)}</ul>
            </Card>
          )}
          <Card title="Kaydedilen ekstreler">
            {done.length === 0 ? <Empty title="Henüz kaydedilmiş ekstre yok" /> : <ul className="divide-y divide-line -my-3">{done.map(row)}</ul>}
          </Card>
        </div>
      </div>
    </>
  )
}
