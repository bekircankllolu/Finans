import { AccountsSettings, CategorySettings, HoldingsSettings, IncomeSettings } from '@/components/finans/Settings'
import { Card, PageHeader } from '@/components/finans/ui'
import { getRates } from '@/lib/finans/fx'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'

export default async function SettingsPage() {
  const { supabase } = await getFinanceContext()
  const { data } = await getFinanceSnapshot()
  const [{ data: rules }, { updatedAt }] = await Promise.all([
    supabase.from('fin_merchant_rules').select('id, pattern, category_id').order('pattern'),
    getRates(supabase),
  ])

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="Hesaplar, gelir kaynakları, varlıklar ve kategoriler." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Hesaplar">
          <AccountsSettings accounts={data.accounts} />
        </Card>
        <Card title="Gelir kaynakları">
          <IncomeSettings incomes={data.incomes} fx={data.fx} />
        </Card>
        <Card title="Varlıklar & kurlar" className="lg:col-span-2">
          <HoldingsSettings holdings={data.holdings} fx={data.fx} fxUpdatedAt={updatedAt} />
        </Card>
        <Card title="Kategoriler & kurallar" className="lg:col-span-2">
          <CategorySettings categories={data.categories} rules={rules ?? []} />
        </Card>
      </div>
    </>
  )
}
