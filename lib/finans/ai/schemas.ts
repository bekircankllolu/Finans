import { z } from 'zod'
import { TX_TYPES } from '../txTypes'

// AI çıkarım şemaları. Sunucu bağımlılığı yok; pipeline testleri de bu tipleri kullanır.

const isoDate = z.string().describe('YYYY-MM-DD')
const money = z.number().describe('Pozitif sayı, Türkçe biçim (1.234,56) çevrilmiş')

export const ACCOUNT_TYPES = ['credit_card', 'checking', 'kmh', 'savings', 'investment', 'cash'] as const

export const extractedTransaction = (categoryNames: string[]) =>
  z.object({
    date: isoDate.describe('İşlem tarihi YYYY-MM-DD. Belgede yıl yoksa ekstre döneminden çıkar (Aralık→Ocak geçişine dikkat).'),
    description: z.string().describe('Ekstredeki açıklama aynen; kart/IBAN/TC numarası olmadan'),
    merchant: z.string().describe('Sade işyeri / karşı taraf adı, ör. MIGROS, NETFLIX, AHMET YILMAZ'),
    amount: money.describe('Bu dönemde hesaba yansıyan TL (hesap para birimi) tutarı; her zaman pozitif'),
    direction: z.enum(['in', 'out']).describe('out: harcama/çıkış/borçlanma; in: ödeme/iade/gelen para'),
    type: z.enum(TX_TYPES),
    currency: z.string().describe('amount alanının para birimi (genelde TRY)'),
    original_amount: z.number().nullable().describe('Döviz işlemde orijinal tutar (ör. 12.99), yoksa null'),
    original_currency: z.string().nullable().describe('Döviz işlemde orijinal para birimi (USD, EUR), yoksa null'),
    installment_no: z.number().int().nullable().describe('Taksitli işlemde bu ayın taksit numarası (3/6 → 3)'),
    installment_total: z.number().int().nullable().describe('Toplam taksit sayısı (3/6 → 6)'),
    category: z.enum(categoryNames as [string, ...string[]]),
    confidence: z.enum(['high', 'medium', 'low']).describe('Bu satırı doğru okuduğundan ne kadar eminsin'),
    page: z.number().int().nullable().describe('Satırın bulunduğu sayfa/görsel numarası (1’den başlar)'),
  })

export const statementSchema = (categoryNames: string[]) =>
  z.object({
    document_kind: z.enum(['credit_card_statement', 'account_statement', 'loan_schedule', 'other']),
    bank: z.string().nullable().describe('Banka adı, ör. Garanti BBVA, Yapı Kredi, Akbank, QNB, Enpara'),
    card_brand: z.string().nullable().describe('Kart markası/ürünü, ör. Bonus, World, Maximum, Axess'),
    account_type: z.enum(ACCOUNT_TYPES),
    account_name: z.string().nullable().describe('Kart/hesap adı, ör. Bonus Platinum, Vadesiz TL Hesabı'),
    last4: z.string().nullable().describe('Kart veya hesap numarasının SADECE son 4 hanesi'),
    currency: z.string().describe('Hesap para birimi, ör. TRY'),
    period_start: isoDate.nullable(),
    period_end: isoDate.nullable().describe('Hesap kesim tarihi / döküm bitişi'),
    due_date: isoDate.nullable().describe('Son ödeme tarihi (kart)'),
    previous_balance: z.number().nullable().describe('Kart: önceki dönem borcu / devreden borç (alacaklıysa eksi)'),
    total_debt: z.number().nullable().describe('Kart: bu dönem borcu / ekstre borcu'),
    min_payment: z.number().nullable().describe('Kart: asgari ödeme tutarı'),
    credit_limit: z.number().nullable(),
    opening_balance: z.number().nullable().describe('Vadesiz: dönem başı / devreden bakiye (eksi olabilir)'),
    closing_balance: z.number().nullable().describe('Vadesiz: dönem sonu bakiye (eksi olabilir)'),
    payments_total: z.number().nullable().describe('Belgede yazıyorsa: dönem içi ödeme+iade toplamı'),
    purchases_total: z.number().nullable().describe('Belgede yazıyorsa: dönem içi harcama toplamı'),
    transactions: z.array(extractedTransaction(categoryNames)),
    warnings: z.array(z.string()).describe('Okunamayan sayfa, belirsiz satır vb. (Türkçe)'),
  })

export const verifySchema = (categoryNames: string[]) =>
  z.object({
    remove: z.array(z.number().int()).describe('Silinmesi gereken satırların index numaraları'),
    update: z.array(
      z.object({
        index: z.number().int(),
        date: isoDate.nullable(),
        amount: z.number().nullable(),
        direction: z.enum(['in', 'out']).nullable(),
        type: z.enum(TX_TYPES).nullable(),
        description: z.string().nullable(),
      }),
    ),
    add: z.array(extractedTransaction(categoryNames)),
    meta: z.object({
      previous_balance: z.number().nullable(),
      total_debt: z.number().nullable(),
      opening_balance: z.number().nullable(),
      closing_balance: z.number().nullable(),
    }),
    notes: z.string().describe('Neyi neden değiştirdiğinin kısa Türkçe özeti; değişiklik yoksa boş'),
  })

export const loanSchema = z.object({
  bank: z.string().nullable(),
  name: z.string().nullable().describe('Kredi türü, ör. İhtiyaç Kredisi, Taşıt Kredisi'),
  principal: z.number().nullable().describe('Kullandırılan kredi tutarı'),
  monthly_rate: z.number().nullable().describe('Aylık akdi faiz oranı yüzde olarak, ör. 3.29'),
  term_months: z.number().int().nullable(),
  installments: z.array(
    z.object({
      no: z.number().int(),
      due_date: isoDate,
      principal: z.number(),
      interest: z.number(),
      tax: z.number().describe('KKDF + BSMV toplamı, yoksa 0'),
      total: z.number(),
      remaining_principal: z.number(),
    }),
  ),
  warnings: z.array(z.string()),
})

export type ParsedStatement = z.infer<ReturnType<typeof statementSchema>>
export type ParsedTransaction = ParsedStatement['transactions'][number]
export type VerifyResult = z.infer<ReturnType<typeof verifySchema>>
export type ParsedLoanSchedule = z.infer<typeof loanSchema>
