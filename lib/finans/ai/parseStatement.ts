import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import ExcelJS from 'exceljs'
import { bankKnowledgeForPrompt } from '../banks'
import { TX_TYPE_LABELS, TX_TYPES } from '../txTypes'
import { anthropic, assertNotRefused, EXTRACT_MODEL, PARSE_MODEL } from './client'
import {
  loanSchema,
  statementSchema,
  verifySchema,
  type ParsedLoanSchedule,
  type ParsedStatement,
  type VerifyResult,
} from './schemas'

export type { ParsedLoanSchedule, ParsedStatement, VerifyResult }

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

const TYPE_GUIDE = TX_TYPES.map(t => `${t} (${TX_TYPE_LABELS[t]})`).join(', ')

// Türk banka ekstrelerinin bilinen tuzaklarına göre yazılmış çıkarım kılavuzu
const STATEMENT_SYSTEM = `Sen Türk bankalarının kredi kartı ekstrelerini ve vadesiz/KMH hesap dökümlerini satır satır, eksiksiz ve birebir okuyan bir veri çıkarma uzmanısın. Hata maliyeti yüksek: kullanıcının borç ve harcama hesapları bu verilere dayanıyor.

GENEL
- Belgedeki HER gerçek para hareketini çıkar; hiçbir satırı atlama, birleştirme veya uydurma. Birden fazla sayfa/görsel varsa hepsini sırayla oku ve aynı satırı iki kez yazma (sayfa geçişlerinde tekrar eden başlık/satırlara dikkat).
- Tutar her zaman pozitif; yön direction alanında. Türkçe sayı biçimini doğru çevir: "1.234,56" = 1234.56, "1.234" = 1234 (binlik ayraç), "12,5" = 12.5.
- Tarihleri YYYY-MM-DD yaz. Belgede yıl yoksa ekstre döneminden çıkar; dönem Aralık→Ocak'a yayılıyorsa Aralık işlemleri önceki yıldır.
- Emin olmadığın satırları yine de yaz ama confidence "low" ver ve warnings'e nedenini ekle.

İŞLEM OLMAYAN SATIRLAR (listeye ALMA)
- Önceki dönem borcu/devreden bakiye, dönem borcu, asgari ödeme, toplam satırları, ara toplamlar, "kalan taksit tutarı" bilgisi.
- Puan/ödül hareketleri: Bonus, Worldpuan, MaxiPuan, Chip-para, ParafPara, Bankkart Lira kazanım satırları (puanla yapılan ÖDEME ise gerçek bir giriş olabilir, onu in olarak al).
- Gelecek dönem taksit planı tabloları, kampanya bilgilendirmeleri, faiz oranı tabloları.

KREDİ KARTI EKSTRESİ
- Harcama, taksit, nakit avans, faiz, ücret, vergi → out. Karta yapılan ödeme, iade, puanla ödeme → in.
- Taksitli işlemde satırdaki BU AYIN taksit tutarını al (toplam alışveriş tutarını değil). "3/6", "3. Taksit/6", "6 taksitin 3.sü" → installment_no=3, installment_total=6, type=installment.
- Yurt dışı/döviz işlemde amount = ekstreye yansıyan TL tutarı; orijinal döviz tutarı original_amount/original_currency'ye. type=fx_purchase.
- Özet kutusundan previous_balance (önceki dönem borcu; kart alacaklıysa eksi), total_debt (dönem borcu), min_payment, due_date, credit_limit, varsa payments_total ve purchases_total al.
- Kontrol: previous_balance + çıkışlar − girişler ≈ total_debt olmalı. Tutmuyorsa satırları yeniden gözden geçir.

VADESİZ / KMH HESAP DÖKÜMÜ
- "Borç" kolonu çıkış (out), "Alacak" kolonu giriş (in); işaretli tek kolonda eksi out, artı in. "Bakiye" kolonu tutar DEĞİLDİR.
- opening_balance (dönem başı/devreden) ve closing_balance (son bakiye) değerlerini al; bakiye eksiyse KMH kullanılıyordur (eksi işaretiyle yaz). Kontrol: opening + girişler − çıkışlar ≈ closing.
- Hesap eksiye düşüyor veya "KMH/Kredili Mevduat" yazıyorsa account_type=kmh.
- Kart borcu ödemesi ve kendi hesapları arası virman → own_transfer. Başkasına giden/gelen havale/EFT/FAST → eft_out/eft_in. Maaş → salary. "KREDİ TAKSİT TAHSİLATI" → loan_payment. Kredi kullandırımı → loan_disbursement. KMH faizi, BSMV, KKDF, hesap işletim ücreti → interest/tax/fee. ATM çekimi → cash_withdrawal.

İŞLEM TİPLERİ: ${TYPE_GUIDE}

KATEGORİ
- Her satıra verilen listeden en uygun kategoriyi ver. Kart ödemesi/virman → "Transfer / Kart Ödemesi"; kredi taksiti → "Kredi Ödemesi"; kredi kullandırımı → "Kredi Kullanımı"; faiz/ücret → "Faiz & Banka Ücretleri".

GİZLİLİK
- Kart numarası, IBAN, TC kimlik numarası, müşteri numarası hiçbir alana tam yazılmaz; sadece last4.

BANKA BİLGİSİ (banka/kart markası eşlemesi ve format ipuçları)
${bankKnowledgeForPrompt()}`

const VERIFY_SYSTEM = `${STATEMENT_SYSTEM}

ŞİMDİKİ GÖREV: Daha önce bu belgeden çıkarılmış işlem listesi ekstrenin kendi toplamlarıyla tutmadı. Belgeyi satır satır yeniden kontrol et ve SADECE gerçekten hatalı olanları düzelt:
- Listede olmayan gerçek işlemleri add'e ekle.
- Gerçek işlem olmayan (özet, puan, toplam) veya iki kez yazılmış satırları remove'a index ile ekle.
- Tutarı, tarihi, yönü veya tipi yanlış okunmuş satırları update'e yaz (değişmeyen alanlar null).
- Özet alanlarını (önceki borç, dönem borcu, açılış/kapanış bakiye) yanlış okuduysan meta'da düzelt, doğruysa null bırak.
Belgede karşılığı olmayan hiçbir şey ekleme. Fark belgedeki gerçek bir durumdan kaynaklanıyorsa (ör. ekstrede gösterilmeyen faiz) değişiklik yapma, notes'ta açıkla.`

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


export async function filesToContent(files: { buffer: Buffer; mimeType: string; fileName: string }[]): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = []
  for (const [i, f] of files.entries()) {
    if (files.length > 1) blocks.push({ type: 'text', text: `--- Sayfa/görsel ${i + 1}: ${f.fileName} ---` })
    blocks.push(await fileToContent(f.buffer, f.mimeType, f.fileName))
  }
  return blocks
}

export interface ExtractContext {
  categoryNames: string[]
  // Hesap önceden biliniyorsa bankasına ait öğrenilmiş kurallar
  bankRuleHints?: string
}

export async function extractStatement(content: Anthropic.ContentBlockParam[], ctx: ExtractContext): Promise<ParsedStatement> {
  const hints = ctx.bankRuleHints ? `\n\nBu hesabın bankası için kullanıcının daha önce öğrettiği kurallar:\n${ctx.bankRuleHints}` : ''
  const stream = anthropic.messages.stream({
    model: EXTRACT_MODEL,
    max_tokens: 64000,
    output_config: { effort: 'high', format: zodOutputFormat(statementSchema(ctx.categoryNames)) },
    system: STATEMENT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...content,
          {
            type: 'text',
            text: `Bu belgeyi çıkar. Kategoriler: ${ctx.categoryNames.join(', ')}.${hints}`,
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

export async function verifyStatement(
  content: Anthropic.ContentBlockParam[],
  parsed: ParsedStatement,
  discrepancy: string,
  categoryNames: string[],
): Promise<VerifyResult> {
  const table = parsed.transactions
    .map((t, i) => [i, t.date, t.description, t.amount.toFixed(2), t.direction, t.type, t.installment_no ? `${t.installment_no}/${t.installment_total}` : ''].join('\t'))
    .join('\n')
  const meta = JSON.stringify({
    previous_balance: parsed.previous_balance,
    total_debt: parsed.total_debt,
    opening_balance: parsed.opening_balance,
    closing_balance: parsed.closing_balance,
    payments_total: parsed.payments_total,
    purchases_total: parsed.purchases_total,
  })
  const stream = anthropic.messages.stream({
    model: EXTRACT_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high', format: zodOutputFormat(verifySchema(categoryNames)) },
    system: VERIFY_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...content,
          {
            type: 'text',
            text: `Önceki okumanın özet alanları: ${meta}\n\nUyuşmazlık: ${discrepancy}\n\nÇıkarılan işlemler (index, tarih, açıklama, tutar, yön, tip, taksit):\n${table}\n\nKategoriler: ${categoryNames.join(', ')}`,
          },
        ],
      },
    ],
  })
  const message = await stream.finalMessage()
  assertNotRefused(message)
  if (!message.parsed_output) throw new Error('Kontrol turu tamamlanamadı.')
  return message.parsed_output
}

export async function parseLoanSchedule(content: Anthropic.ContentBlockParam[]): Promise<ParsedLoanSchedule> {
  const stream = anthropic.messages.stream({
    model: PARSE_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'medium', format: zodOutputFormat(loanSchema) },
    system: LOAN_SYSTEM,
    messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Bu kredi ödeme planını çıkar.' }] }],
  })
  const message = await stream.finalMessage()
  assertNotRefused(message)
  if (!message.parsed_output) throw new Error('Ödeme planı okunamadı.')
  return message.parsed_output
}
