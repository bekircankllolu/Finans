import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { anthropic, assertNotRefused, PARSE_MODEL } from './client'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

const isoDate = z.string().describe('YYYY-MM-DD')

const statementSchema = (categoryNames: string[]) =>
  z.object({
    bank: z.string().nullable().describe('Banka adı, ör. Garanti BBVA, Yapı Kredi, Akbank'),
    account_type: z.enum(['credit_card', 'checking', 'kmh', 'savings', 'investment', 'cash']),
    account_name: z.string().nullable().describe('Kart/hesap adı, ör. Bonus Platinum, Maaş Hesabı'),
    last4: z.string().nullable().describe('Kart veya hesap numarasının SADECE son 4 hanesi'),
    currency: z.string().describe('ISO kod, ör. TRY'),
    period_start: isoDate.nullable(),
    period_end: isoDate.nullable().describe('Hesap kesim tarihi'),
    due_date: isoDate.nullable().describe('Son ödeme tarihi (kredi kartı)'),
    total_debt: z.number().nullable().describe('Dönem borcu (kredi kartı)'),
    min_payment: z.number().nullable().describe('Asgari ödeme tutarı'),
    closing_balance: z.number().nullable().describe('Dönem sonu bakiye (vadesiz hesap)'),
    credit_limit: z.number().nullable(),
    transactions: z.array(
      z.object({
        date: isoDate,
        description: z.string().describe('Ekstredeki açıklama, kart/IBAN numarası olmadan'),
        merchant: z.string().describe('Sade işyeri/karşı taraf adı, ör. MIGROS, NETFLIX, AHMET YILMAZ'),
        amount: z.number().describe('Her zaman pozitif tutar'),
        direction: z.enum(['in', 'out']).describe('out: harcama/çıkış/borç, in: ödeme/iade/gelen para'),
        currency: z.string(),
        installment_no: z.number().int().nullable().describe('Taksitli işlemde kaçıncı taksit, ör. 3/6 ise 3'),
        installment_total: z.number().int().nullable().describe('Toplam taksit sayısı, ör. 3/6 ise 6'),
        category: z.enum(categoryNames as [string, ...string[]]),
      }),
    ),
    warnings: z.array(z.string()).describe('Okunamayan sayfa, toplam uyuşmazlığı gibi uyarılar (Türkçe)'),
  })

const loanSchema = z.object({
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
export type ParsedLoanSchedule = z.infer<typeof loanSchema>

const STATEMENT_SYSTEM = `Sen Türk bankalarının hesap ve kredi kartı ekstrelerini okuyan bir veri çıkarma asistanısın.
Kurallar:
- Ekstredeki HER işlem satırını eksiksiz çıkar. Özet/toplam satırlarını, "önceki dönem borcu" gibi devir satırlarını işlem olarak ekleme.
- Tutarlar daima pozitif sayı; yön direction alanında. Türkçe sayı biçimini (1.234,56) doğru çevir.
- Kredi kartında: harcama, nakit avans, faiz, ücret → out. Karta yapılan ödeme, iade, puan/cashback → in.
- Vadesiz hesapta: para çıkışı → out, para girişi → in.
- "3/6", "3. taksit / 6" gibi taksit bilgisini installment_no / installment_total alanlarına yaz. Taksitli satırın tutarı o ayki taksit tutarıdır.
- Karta yapılan ödemeleri ve kendi hesapları arası virmanları "Transfer / Kart Ödemesi" kategorisine koy. Kredi kullandırım tutarını "Kredi Kullanımı" kategorisine, kredi taksit ödemelerini "Kredi Ödemesi" kategorisine koy.
- Kart numarası, IBAN, TC kimlik numarası gibi bilgileri hiçbir alana tam yazma; sadece last4.
- Emin olmadığın veya okuyamadığın kısımları warnings'e yaz. Tahmin uydurma.`

const LOAN_SYSTEM = `Sen Türk bankalarının kredi ödeme planlarını okuyan bir veri çıkarma asistanısın.
Ödeme planındaki her taksiti eksiksiz çıkar. Türkçe sayı biçimini (1.234,56) doğru çevir. KKDF ve BSMV'yi tax alanında topla.
Aylık faiz oranı yüzde olarak yazılır (ör. %3,29 → 3.29). Okuyamadığın kısımları warnings'e yaz.`

async function excelToText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const parts: string[] = []
  wb.eachSheet(sheet => {
    parts.push(`## Sayfa: ${sheet.name}`)
    sheet.eachRow(row => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(v => {
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        if (v && typeof v === 'object' && 'result' in v) return String(v.result ?? '')
        if (v && typeof v === 'object' && 'text' in v) return String(v.text)
        return v == null ? '' : String(v)
      })
      parts.push(cells.join('\t'))
    })
  })
  return parts.join('\n')
}

function decodeText(buffer: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  // Bazı bankaların CSV'leri Windows-1254 (Türkçe) kodlu gelir
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1254').decode(buffer) : utf8
}

export async function fileToContent(buffer: Buffer, mimeType: string, fileName: string): Promise<Anthropic.ContentBlockParam> {
  const lower = fileName.toLowerCase()
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
  }
  if ((IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return { type: 'image', source: { type: 'base64', media_type: mimeType as ImageType, data: buffer.toString('base64') } }
  }
  if (lower.endsWith('.xlsx')) {
    return { type: 'text', text: `Excel dosyası (${fileName}) içeriği, sekmeyle ayrılmış:\n\n${await excelToText(buffer)}` }
  }
  if (lower.endsWith('.xls')) {
    throw new Error('Eski .xls biçimi desteklenmiyor. Dosyayı Excel’de .xlsx veya .csv olarak kaydedip yükleyin.')
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || mimeType.startsWith('text/')) {
    return { type: 'text', text: `CSV/metin dosyası (${fileName}) içeriği:\n\n${decodeText(buffer)}` }
  }
  throw new Error(`Desteklenmeyen dosya türü: ${mimeType || fileName}`)
}

export async function parseBankStatement(content: Anthropic.ContentBlockParam, categoryNames: string[]): Promise<ParsedStatement> {
  const stream = anthropic.messages.stream({
    model: PARSE_MODEL,
    max_tokens: 64000,
    output_config: { effort: 'medium', format: zodOutputFormat(statementSchema(categoryNames)) },
    system: STATEMENT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          content,
          {
            type: 'text',
            text: `Bu ekstreyi çıkar. Her işlemi şu kategorilerden birine ata: ${categoryNames.join(', ')}.`,
          },
        ],
      },
    ],
  })
  const message = await stream.finalMessage()
  assertNotRefused(message)
  if (!message.parsed_output) throw new Error('Ekstre okunamadı.')
  return message.parsed_output
}

export async function parseLoanSchedule(content: Anthropic.ContentBlockParam): Promise<ParsedLoanSchedule> {
  const stream = anthropic.messages.stream({
    model: PARSE_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'medium', format: zodOutputFormat(loanSchema) },
    system: LOAN_SYSTEM,
    messages: [{ role: 'user', content: [content, { type: 'text', text: 'Bu kredi ödeme planını çıkar.' }] }],
  })
  const message = await stream.finalMessage()
  assertNotRefused(message)
  if (!message.parsed_output) throw new Error('Ödeme planı okunamadı.')
  return message.parsed_output
}
