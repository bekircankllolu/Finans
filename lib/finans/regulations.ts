// Türkiye'de kişisel finans hesaplarında kullanılan düzenleyici sabitler.
// Değerler değiştiğinde tek yerden güncellenir; Ayarlar ekranında tarihiyle gösterilir.
// Not: TCMB azami kart faizleri aylık güncellenir; kendi ekstrendeki oranı hesap ayarına gir.

export const REGULATIONS_UPDATED = '2026-10-01'

export const REGULATIONS = {
  // Tüketici kredisi ve kart faizi üzerinden alınan vergi/fon
  kkdfRate: 0.15,
  bsmvRate: 0.15,
  // Kredi kartı asgari ödeme oranı (BDDK): limit eşiğine göre
  cardMinPayment: { thresholdLimit: 50_000, belowRate: 0.2, aboveRate: 0.4 },
  // Kredi kartı ve KMH için varsayılan aylık akdi faiz (%), hesap ayarından ezilebilir
  defaultCardMonthlyRate: 4.25,
  // Tüketici kredisi erken ödeme tazminatı üst sınırı (6502 s. Kanun m.37)
  earlyRepaymentFee: { thresholdMonths: 36, belowRate: 0.01, aboveRate: 0.02 },
} as const

export const CONSUMER_TAX_RATE = REGULATIONS.kkdfRate + REGULATIONS.bsmvRate

export function cardMinPaymentRate(limit: number | null): number {
  const r = REGULATIONS.cardMinPayment
  return limit != null && limit > r.thresholdLimit ? r.aboveRate : r.belowRate
}

export function earlyRepaymentFeeRate(remainingMonths: number): number {
  const r = REGULATIONS.earlyRepaymentFee
  return remainingMonths > r.thresholdMonths ? r.aboveRate : r.belowRate
}

export function regulationsForPrompt(): string {
  const r = REGULATIONS
  return [
    `KKDF %${r.kkdfRate * 100} + BSMV %${r.bsmvRate * 100} (tüketici kredisi ve kart faizi üzerinden)`,
    `Kart asgari ödeme: limit ${r.cardMinPayment.thresholdLimit.toLocaleString('tr-TR')} TL'ye kadar %${r.cardMinPayment.belowRate * 100}, üstünde %${r.cardMinPayment.aboveRate * 100}`,
    `Varsayılan kart/KMH aylık akdi faiz: %${r.defaultCardMonthlyRate.toLocaleString('tr-TR')}`,
    `Erken kredi kapama tazminatı: kalan vade ≤${r.earlyRepaymentFee.thresholdMonths} ay %${r.earlyRepaymentFee.belowRate * 100}, üstü %${r.earlyRepaymentFee.aboveRate * 100}`,
  ].join('; ')
}
