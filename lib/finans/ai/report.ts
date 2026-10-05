import 'server-only'
import { ADVISOR_MODEL, anthropic, assertNotRefused, textOf } from './client'

export const ADVISOR_PERSONA = `Sen Türkiye'de yaşayan bir kişinin deneyimli, dürüst ve pratik kişisel finans danışmanısın.
Bağlam: Türkiye — yüksek enflasyon, TL mevduat faizleri, kredi kartı akdi faizi + KKDF/BSMV, asgari ödeme tuzağı, taksitli alışveriş kültürü, döviz/altın birikimi, BES devlet katkısı.
İlkeler:
- Sadece sana verilen verideki rakamları kullan. Rakam uydurma; hesap gerekiyorsa veriden türet ve nasıl türettiğini kısaca söyle.
- Kısa ve maddeli yaz. Gereksiz giriş cümlesi kurma.
- Her öneri somut olsun: hangi borç, hangi tutar, hangi tarih.
- Öncelik sırası: (1) gecikme/faiz riskini sıfırla, (2) yüksek faizli borcu kapat, (3) acil durum fonu, (4) birikim/yatırım.
- Yatırım konusunda genel ilke ver, belirli hisse/fon önerme.`

const REPORT_INSTRUCTIONS = `Aşağıdaki finansal özetten {MONTH} ayı için aylık rapor yaz. Markdown kullan, şu başlıklarla:

## Özet
3-4 madde: net durum, gelir/gider/net, sağlık skoru ve tek cümlelik genel değerlendirme.

## Ne değişti
Bir önceki aya ve 3 ay ortalamasına göre öne çıkan farklar (kategori bazında, TL ve %).

## Dikkat edilmesi gerekenler
Para kaçakları, düzenli ödemeler/abonelikler, bütçe aşımları, limit kullanımı, KMH, yaklaşan ödemeler.

## Borç durumu ve strateji
Kart, KMH, kredi ve taksitler. Hangi borç önce kapatılmalı (çığ vs kartopu karşılaştırması), erken kapama mantıklı mı.

## Önümüzdeki 6 ay
Nakit akışı tahmininden riskli aylar ve neden.

## Aksiyon planı
3-5 numaralı, somut, tutarlı ve tarihli adım.

Veri:
\`\`\`json
{DATA}
\`\`\``

export async function generateMonthlyReport(month: string, context: object): Promise<string> {
  const stream = anthropic.messages.stream({
    model: ADVISOR_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high' },
    system: ADVISOR_PERSONA,
    messages: [
      {
        role: 'user',
        content: REPORT_INSTRUCTIONS.replace('{MONTH}', month).replace('{DATA}', JSON.stringify(context, null, 1)),
      },
    ],
  })
  const message = await stream.finalMessage()
  assertNotRefused(message)
  return textOf(message).trim()
}
