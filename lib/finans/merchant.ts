// Ekstre açıklamalarını karşılaştırılabilir merchant adına indirger.
// "MIGROS 4521 ISTANBUL TR" → "MIGROS", "NETFLIX.COM 866-579-7172 NL" → "NETFLIX.COM"
const NOISE = /\b(TR|TUR|TURKEY|TÜRKİYE|ISTANBUL|İSTANBUL|ANKARA|IZMIR|İZMİR|ANTALYA|ALANYA|NL|IE|US|GB|LU)\b/g

export function normalizeMerchant(raw: string): string {
  const cleaned = raw
    .toLocaleUpperCase('tr-TR')
    .replace(/[*#]/g, ' ')
    .replace(/\b\d[\d\-/.]{2,}\b/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || raw.trim().toLocaleUpperCase('tr-TR')
}

export function rulePattern(merchant: string): string {
  return normalizeMerchant(merchant).toLocaleLowerCase('tr-TR')
}

export interface MerchantRule {
  pattern: string
  category_id: string
}

// Önce tam eşleşme, sonra en uzun "içerir" eşleşmesi (kısa kalıplar yanlış pozitif üretmesin diye ≥4 karakter)
export function matchRule(merchant: string, rules: MerchantRule[]): string | null {
  const key = rulePattern(merchant)
  const exact = rules.find(r => r.pattern === key)
  if (exact) return exact.category_id
  const partial = rules
    .filter(r => r.pattern.length >= 4 && key.includes(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0]
  return partial?.category_id ?? null
}

// Kart/IBAN numaralarını son 4 hane hariç maskeler
export function maskSensitive(text: string): string {
  return text
    .replace(/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, m => `TR** **** ${m.replace(/\s/g, '').slice(-4)}`)
    .replace(/\b(?:\d[ -]?){12,15}(\d{4})\b/g, (_m, last4: string) => `**** ${last4}`)
}

// Aynı gün aynı tutarlı iki işlem için sıra numarası eklenir; böylece tekrar yüklenen ekstre
// aynı anahtarları üretir ama gerçek tekrarlar kaybolmaz.
export function dedupeKeys(
  accountId: string,
  txns: { date: string; amount: number; direction: string; description: string }[],
): string[] {
  const seen = new Map<string, number>()
  return txns.map(t => {
    const base = [accountId, t.date, t.amount.toFixed(2), t.direction, normalizeMerchant(t.description)].join('|')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}|${n}`
  })
}
