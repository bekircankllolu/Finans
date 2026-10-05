import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { categoryMap, signedExpense, signedIncome } from '../calc/cashflow'
import { addMonths, monthKey } from '../calc/dates'
import { compareStrategies } from '../calc/debtStrategy'
import { forecast } from '../calc/forecast'
import { installmentLoadByMonth } from '../calc/installments'
import { annuityPayment } from '../calc/loans'
import type { Snapshot } from '../calc/snapshot'
import type { FinanceData } from '../types'
import { ADVISOR_MODEL, anthropic } from './client'
import { snapshotForAI } from './context'
import { ADVISOR_PERSONA } from './report'

const r = (n: number) => Math.round(n)

const QueryInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  category: z.string().optional(),
  merchant_contains: z.string().optional(),
  direction: z.enum(['in', 'out']).optional(),
  min_amount: z.number().optional(),
  limit: z.number().int().min(1).max(200).optional(),
})
const TrendInput = z.object({ category: z.string() })
const PurchaseInput = z.object({
  price: z.number().positive(),
  down_payment: z.number().min(0).optional(),
  installments: z.number().int().min(1).max(120),
  monthly_rate_pct: z.number().min(0).max(20).optional(),
  start_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})
const PayoffInput = z.object({ extra_monthly: z.number().min(0) })

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_overview',
    description:
      'Kullanıcının tüm finansal özetini döner: net değer, son 12 ay gelir/gider, odak ay kategori kırılımı, kartlar, krediler, taksitler, düzenli ödemeler, 6 aylık nakit akışı tahmini, borç stratejileri, bütçe, hedefler ve uyarılar. Bir soruya başlarken önce bunu çağır.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'query_transactions',
    description:
      'İşlemleri filtreleyip listeler ve toplamını verir. "Geçen ay yemeğe ne harcadım", "Netflix’e yılda ne ödüyorum" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM' },
        category: { type: 'string', description: 'Kategori adı (tam ad)' },
        merchant_contains: { type: 'string', description: 'İşyeri adında geçen metin' },
        direction: { type: 'string', enum: ['in', 'out'] },
        min_amount: { type: 'number' },
        limit: { type: 'integer', description: 'En fazla kaç satır (varsayılan 50)' },
      },
    },
  },
  {
    name: 'get_category_trend',
    description: 'Bir kategorinin son 12 aylık aylık harcama/gelir tutarlarını verir.',
    input_schema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
  },
  {
    name: 'simulate_purchase',
    description:
      'Taksitli/kredili bir alımın (araba, telefon, tatil vb.) aylık ödemesini ve 6 aylık nakit akışına etkisini hesaplar. Kart taksitleri genelde faizsizdir (monthly_rate_pct=0); kredi ise aylık faiz + KKDF/BSMV içerir.',
    input_schema: {
      type: 'object',
      properties: {
        price: { type: 'number', description: 'Toplam fiyat (TL)' },
        down_payment: { type: 'number', description: 'Peşinat (TL)' },
        installments: { type: 'integer', description: 'Taksit sayısı' },
        monthly_rate_pct: { type: 'number', description: 'Aylık faiz yüzdesi; faizsiz taksitte 0' },
        start_month: { type: 'string', description: 'İlk taksit ayı YYYY-MM (varsayılan gelecek ay)' },
      },
      required: ['price', 'installments'],
    },
  },
  {
    name: 'simulate_debt_payoff',
    description:
      'Her ay asgarilere ek olarak extra_monthly TL ödenirse borçların ne zaman biteceğini ve toplam faizi çığ (yüksek faiz önce) ve kartopu (küçük borç önce) yöntemleriyle hesaplar.',
    input_schema: { type: 'object', properties: { extra_monthly: { type: 'number' } }, required: ['extra_monthly'] },
  },
]

function runTool(name: string, input: unknown, s: Snapshot, data: FinanceData): unknown {
  const cats = categoryMap(data.categories)
  const catByName = new Map(data.categories.map(c => [c.name.toLocaleLowerCase('tr-TR'), c]))

  switch (name) {
    case 'get_overview':
      return snapshotForAI(s, data)

    case 'query_transactions': {
      const q = QueryInput.parse(input)
      const cat = q.category ? catByName.get(q.category.toLocaleLowerCase('tr-TR')) : undefined
      if (q.category && !cat) return { error: `Kategori bulunamadı: ${q.category}`, kategoriler: data.categories.map(c => c.name) }
      const needle = q.merchant_contains?.toLocaleLowerCase('tr-TR')
      const rows = data.transactions.filter(
        t =>
          (!q.month || monthKey(t.date) === q.month) &&
          (!cat || t.category_id === cat.id) &&
          (!needle || `${t.merchant} ${t.description}`.toLocaleLowerCase('tr-TR').includes(needle)) &&
          (!q.direction || t.direction === q.direction) &&
          (q.min_amount == null || t.amount_try >= q.min_amount),
      )
      const total = rows.reduce((sum, t) => sum + (t.direction === 'out' ? t.amount_try : -t.amount_try), 0)
      return {
        adet: rows.length,
        net_cikis_tl: r(total),
        islemler: rows.slice(0, q.limit ?? 50).map(t => ({
          tarih: t.date,
          isyeri: t.merchant,
          aciklama: t.description,
          tutar: t.amount_try,
          yon: t.direction,
          kategori: t.category_id ? cats.get(t.category_id)?.name : null,
          taksit: t.installment_total ? `${t.installment_no}/${t.installment_total}` : null,
        })),
      }
    }

    case 'get_category_trend': {
      const q = TrendInput.parse(input)
      const cat = catByName.get(q.category.toLocaleLowerCase('tr-TR'))
      if (!cat) return { error: `Kategori bulunamadı: ${q.category}`, kategoriler: data.categories.map(c => c.name) }
      const byMonth = new Map(s.months.map(m => [m.month, 0]))
      for (const t of data.transactions) {
        if (t.category_id !== cat.id || !byMonth.has(monthKey(t.date))) continue
        const v = cat.kind === 'income' ? signedIncome(t, cats) : signedExpense(t, cats)
        byMonth.set(monthKey(t.date), byMonth.get(monthKey(t.date))! + v)
      }
      return { kategori: cat.name, aylar: [...byMonth].map(([ay, tutar]) => ({ ay, tutar: r(tutar) })) }
    }

    case 'simulate_purchase': {
      const q = PurchaseInput.parse(input)
      const financed = Math.max(0, q.price - (q.down_payment ?? 0))
      const rate = q.monthly_rate_pct ?? 0
      const monthly = annuityPayment(financed, rate, q.installments, rate > 0)
      const start = q.start_month ?? addMonths(s.currentMonth, 1)
      const extra = new Map<string, number>()
      for (let i = 0; i < q.installments; i++) extra.set(addMonths(start, i), monthly)
      if (q.down_payment) extra.set(s.currentMonth, (extra.get(s.currentMonth) ?? 0) + q.down_payment)
      const after = forecast({
        startMonth: s.currentMonth,
        months: 6,
        startBalance: s.netWorth.liquid - s.netWorth.cardDebt - s.netWorth.kmhDebt,
        incomes: data.incomes,
        fx: data.fx,
        baseSpend: s.baseSpend,
        loans: s.loans,
        installmentLoad: installmentLoadByMonth(s.installments),
        extra,
      })
      return {
        aylik_odeme: r(monthly),
        toplam_geri_odeme: r(monthly * q.installments + (q.down_payment ?? 0)),
        toplam_faiz_vergi: r(monthly * q.installments - financed),
        mevcut_aylik_borc_servisi: r(s.loans.reduce((a, l) => a + l.monthlyPayment, 0) + s.cards.reduce((a, c) => a + c.minPayment, 0)),
        duzenli_aylik_gelir: r(s.recurringIncome),
        nakit_akisi_once: s.forecast.map(f => ({ ay: f.month, ay_sonu: r(f.endBalance) })),
        nakit_akisi_sonra: after.map(f => ({ ay: f.month, ay_sonu: r(f.endBalance) })),
      }
    }

    case 'simulate_debt_payoff': {
      const q = PayoffInput.parse(input)
      const res = compareStrategies(s.debts, q.extra_monthly)
      const fmt = (x: (typeof res)['avalanche']) => ({
        mumkun: x.feasible,
        ay: x.months,
        toplam_faiz: r(x.totalInterest),
        toplam_odeme: r(x.totalPaid),
        kapanis_sirasi: x.payoffOrder.map(p => `${p.name} (${p.month}. ay)`),
      })
      return { ekstra_aylik: q.extra_monthly, sadece_asgari: fmt(res.minimum), cig: fmt(res.avalanche), kartopu: fmt(res.snowball) }
    }

    default:
      return { error: `Bilinmeyen araç: ${name}` }
  }
}

const CHAT_SYSTEM = `${ADVISOR_PERSONA}

Kullanıcının verilerine araçlarla erişirsin. Rakam vermeden önce mutlaka ilgili aracı çağır.
Bugünün tarihi: {TODAY}. Cevapları Türkçe, kısa ve maddeli ver; tutarları TL ve binlik ayraçla yaz (ör. 12.500 TL).`

export async function* runChat(
  history: Anthropic.MessageParam[],
  snapshot: Snapshot,
  data: FinanceData,
): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool'; name: string }, string> {
  const messages = [...history]
  let finalText = ''

  for (let step = 0; step < 8; step++) {
    const stream = anthropic.messages.stream({
      model: ADVISOR_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system: CHAT_SYSTEM.replace('{TODAY}', snapshot.today),
      tools: CHAT_TOOLS,
      messages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        finalText += event.delta.text
        yield { type: 'text', text: event.delta.text }
      }
    }
    const msg = await stream.finalMessage()

    if (msg.stop_reason === 'refusal') {
      const note = '\n\n_Bu soruya yanıt verilemedi._'
      finalText += note
      yield { type: 'text', text: note }
      break
    }

    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) break

    messages.push({ role: 'assistant', content: msg.content })
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map(tu => {
      try {
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(runTool(tu.name, tu.input, snapshot, data)) }
      } catch (err) {
        return {
          type: 'tool_result',
          tool_use_id: tu.id,
          is_error: true,
          content: err instanceof z.ZodError ? `Geçersiz girdi: ${err.message}` : String(err),
        }
      }
    })
    for (const tu of toolUses) yield { type: 'tool', name: tu.name }
    messages.push({ role: 'user', content: results })
    if (finalText && !finalText.endsWith('\n')) {
      finalText += '\n\n'
      yield { type: 'text', text: '\n\n' }
    }
  }

  return finalText.trim()
}
