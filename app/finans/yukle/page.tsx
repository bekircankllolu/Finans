import Link from 'next/link'
import { Card, Badge, Empty, PageHeader } from '@/components/finans/ui'
import { Uploader } from '@/components/finans/Uploader'
import { DeleteStatementButton } from '@/components/finans/StatementRowActions'
import { formatDateTR, formatTRY } from '@/lib/finans/format'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'

const STATUS: Record<string, { label: string; tone: 'neutral' | 'good' | 'warning' | 'critical' | 'accent' }> = {
  uploaded: { label: 'Yüklendi', tone: 'neutral' },
  parsing: { label: 'Okunuyor', tone: 'accent' },
  parsed: { label: 'Onay bekliyor', tone: 'warning' },
  confirmed: { label: 'Onaylandı', tone: 'good' },
  failed: { label: 'Hata', tone: 'critical' },
}

export default async function UploadPage() {
  const { user } = await getFinanceContext()
  const { data } = await getFinanceSnapshot()
  const accountName = new Map(data.accounts.map(a => [a.id, a.name]))

  return (
    <>
      <PageHeader title="Ekstre yükle" subtitle="Her ay kart ve hesap ekstrelerini yükle. Aynı işlem iki kez eklenmez." />
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2" title="Yeni yükleme">
          <Uploader userId={user.id} accounts={data.accounts.filter(a => a.is_active).map(a => ({ id: a.id, name: a.name }))} />
        </Card>
        <Card className="lg:col-span-3" title="Yüklenen belgeler">
          {data.statements.length === 0 ? (
            <Empty title="Henüz belge yok">İlk ekstreni soldan yükle.</Empty>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-[#8B8B9E] border-b border-white/8">
                    <th className="py-2 font-medium">Dosya</th>
                    <th className="py-2 font-medium">Hesap</th>
                    <th className="py-2 font-medium">Dönem</th>
                    <th className="py-2 font-medium text-right">Borç/Bakiye</th>
                    <th className="py-2 font-medium">Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {data.statements.map(st => {
                    const status = STATUS[st.status]
                    const amount = st.total_debt ?? st.closing_balance
                    return (
                      <tr key={st.id}>
                        <td className="py-2.5 pr-3 max-w-[200px]">
                          <div className="truncate">{st.file_name}</div>
                          <div className="text-[11px] text-[#5A5A6E]">{st.kind === 'loan_schedule' ? 'Kredi ödeme planı' : 'Ekstre'}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-[#C3C2CF]">{st.account_id ? accountName.get(st.account_id) : '—'}</td>
                        <td className="py-2.5 pr-3 text-[#C3C2CF] whitespace-nowrap">{st.period_end ? formatDateTR(st.period_end) : '—'}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{amount != null ? formatTRY(amount) : '—'}</td>
                        <td className="py-2.5 pr-3">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {st.error && <div className="text-[11px] text-[#f08a8a] mt-1 max-w-[220px] truncate" title={st.error}>{st.error}</div>}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          {(st.status === 'parsed' || st.status === 'failed' || st.status === 'uploaded') && (
                            <Link href={`/finans/yukle/${st.id}`} className="text-xs text-[#00D4FF] mr-2">
                              {st.status === 'parsed' ? 'Onayla' : 'Tekrar dene'}
                            </Link>
                          )}
                          <DeleteStatementButton id={st.id} confirmed={st.status === 'confirmed'} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
