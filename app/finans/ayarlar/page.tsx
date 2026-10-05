import { AccountsSettings, BankRulesSettings, CategorySettings, HoldingsSettings, IncomeSettings } from '@/components/finans/Settings'
import { Card, PageHeader } from '@/components/finans/ui'
import { getRates } from '@/lib/finans/fx'
import { formatDateTR } from '@/lib/finans/format'
import { getFinanceContext, getFinanceSnapshot } from '@/lib/finans/load'
import { REGULATIONS, REGULATIONS_UPDATED } from '@/lib/finans/regulations'

export default async function SettingsPage() {
  const { supabase } = await getFinanceContext()
  const { data } = await getFinanceSnapshot()
  const [{ data: rules }, { data: bankRules }, { updatedAt }] = await Promise.all([
    supabase.from('fin_merchant_rules').select('id, pattern, category_id').order('pattern'),
    supabase.from('fin_bank_rules').select('id, bank, pattern, kind, value').order('bank'),
    getRates(supabase),
  ])
  const r = REGULATIONS

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="Hesaplar, gelir kaynakları, varlıklar, kategoriler ve AI’nın öğrendiği kurallar." />
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
        <Card title="Kategoriler & işyeri kuralları" className="lg:col-span-2">
          <CategorySettings categories={data.categories} rules={rules ?? []} />
        </Card>
        <Card title="Öğrenilen banka kuralları">
          <BankRulesSettings rules={bankRules ?? []} />
        </Card>
        <Card title="Hesaplamalarda kullanılan mevzuat değerleri">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between gap-3"><span className="text-muted">KKDF + BSMV (faiz üzerinden)</span><span>%{r.kkdfRate * 100} + %{r.bsmvRate * 100}</span></li>
            <li className="flex justify-between gap-3">
              <span className="text-muted">Kart asgari ödeme</span>
              <span>%{r.cardMinPayment.belowRate * 100} (limit ≤ {r.cardMinPayment.thresholdLimit.toLocaleString('tr-TR')} TL), üstü %{r.cardMinPayment.aboveRate * 100}</span>
            </li>
            <li className="flex justify-between gap-3"><span className="text-muted">Varsayılan kart/KMH aylık faizi</span><span>%{r.defaultCardMonthlyRate.toLocaleString('tr-TR')}</span></li>
            <li className="flex justify-between gap-3">
              <span className="text-muted">Erken kredi kapama tazminatı</span>
              <span>%{r.earlyRepaymentFee.belowRate * 100} (≤{r.earlyRepaymentFee.thresholdMonths} ay), üstü %{r.earlyRepaymentFee.aboveRate * 100}</span>
            </li>
          </ul>
          <p className="text-xs text-faint mt-4">
            Son gözden geçirme: {formatDateTR(REGULATIONS_UPDATED)}. TCMB azami kart faizleri dönemsel değişir; kendi ekstrendeki oranı Hesaplar’da karta girersen hesaplar ona göre yapılır.
          </p>
        </Card>
      </div>
    </>
  )
}
