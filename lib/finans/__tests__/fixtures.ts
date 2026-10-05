import type { ParsedStatement, ParsedTransaction } from '../ai/schemas'
import { DEFAULT_CATEGORIES } from '../defaults'
import type { Category } from '../types'

// Sentetik ekstreler: Türk bankalarının tipik formatlarındaki tuzakları içerir
// (taksit, döviz harcama, karta ödeme, iade, puan satırı, KMH, maaş, EFT, kredi taksiti).

export const CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
  id: `c${i}`,
  name: c.name,
  kind: c.kind,
  color: '#000',
  is_fixed: c.is_fixed ?? false,
  sort: i,
}))
export const catId = (name: string) => CATEGORIES.find(c => c.name === name)!.id

const tx = (p: Partial<ParsedTransaction> & Pick<ParsedTransaction, 'date' | 'description' | 'amount' | 'direction' | 'type'>): ParsedTransaction => ({
  merchant: p.description,
  currency: 'TRY',
  original_amount: null,
  original_currency: null,
  installment_no: null,
  installment_total: null,
  category: 'Diğer Gider',
  confidence: 'high',
  page: 1,
  ...p,
})

const base = {
  document_kind: 'credit_card_statement' as const,
  last4: '4821',
  currency: 'TRY',
  min_payment: null,
  credit_limit: 120_000,
  opening_balance: null,
  closing_balance: null,
  payments_total: null,
  purchases_total: null,
  warnings: [],
}

// Garanti Bonus: önceki borç 30.000, ödeme 30.000, harcamalar = 41.300 → dönem borcu 41.300
export const garantiBonus: ParsedStatement = {
  ...base,
  bank: 'Garanti BBVA',
  card_brand: 'Bonus Platinum',
  account_type: 'credit_card',
  account_name: 'Bonus Platinum',
  period_start: '2026-08-21',
  period_end: '2026-09-20',
  due_date: '2026-09-30',
  previous_balance: 30_000,
  total_debt: 41_300,
  min_payment: 8_260,
  transactions: [
    tx({ date: '2026-08-25', description: 'HESAPTAN OTOMATIK ODEME', amount: 30_000, direction: 'in', type: 'payment', category: 'Transfer / Kart Ödemesi' }),
    tx({ date: '2026-08-26', description: 'MIGROS SANAL MARKET ISTANBUL', merchant: 'MIGROS', amount: 2_350.4, direction: 'out', type: 'purchase', category: 'Market' }),
    tx({ date: '2026-08-28', description: 'MEDIAMARKT ANTALYA 3/9 TAKSIT', merchant: 'MEDIAMARKT', amount: 7_500, direction: 'out', type: 'installment', installment_no: 3, installment_total: 9, category: 'Teknoloji & Elektronik' }),
    tx({ date: '2026-09-02', description: 'NETFLIX.COM AMSTERDAM NL', merchant: 'NETFLIX', amount: 229.99, direction: 'out', type: 'fx_purchase', original_amount: 5.49, original_currency: 'USD', category: 'Eğlence & Hobi' }),
    tx({ date: '2026-09-05', description: 'TRENDYOL IADE', merchant: 'TRENDYOL', amount: 450, direction: 'in', type: 'refund', category: 'Online Alışveriş' }),
    tx({ date: '2026-09-07', description: 'SHELL ALANYA', merchant: 'SHELL', amount: 2_800, direction: 'out', type: 'purchase', category: 'Ulaşım & Akaryakıt' }),
    tx({ date: '2026-09-10', description: 'YEMEKSEPETI', merchant: 'YEMEKSEPETI', amount: 869.61, direction: 'out', type: 'purchase', category: 'Yeme-İçme' }),
    tx({ date: '2026-09-15', description: 'POS 4471 ANTALYA', merchant: 'POS ANTALYA', amount: 28_000, direction: 'out', type: 'purchase', category: 'Diğer Gider', confidence: 'low' }),
  ],
}

// Enpara vadesiz: açılış 12.000, maaş 92.000 giriş, kira EFT, kart ödemesi, KMH faizi → kapanış eksi (KMH)
export const enparaChecking: ParsedStatement = {
  ...base,
  document_kind: 'account_statement',
  bank: 'QNB Enpara',
  card_brand: null,
  account_type: 'checking',
  account_name: 'Vadesiz TL',
  last4: null,
  credit_limit: null,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  due_date: null,
  previous_balance: null,
  total_debt: null,
  opening_balance: 12_000,
  closing_balance: -1_510,
  transactions: [
    tx({ date: '2026-09-01', description: 'MAAS ODEMESI TRIBAL WORLDWIDE', merchant: 'TRIBAL WORLDWIDE', amount: 92_000, direction: 'in', type: 'salary', category: 'Maaş' }),
    tx({ date: '2026-09-03', description: 'FAST GIDEN AHMET YILMAZ KIRA', merchant: 'AHMET YILMAZ', amount: 28_000, direction: 'out', type: 'eft_out', category: 'Kira & Aidat' }),
    tx({ date: '2026-09-15', description: 'KREDI TAKSIT TAHSILATI', merchant: 'KREDI TAKSIT', amount: 10_827, direction: 'out', type: 'loan_payment', category: 'Kredi Ödemesi' }),
    tx({ date: '2026-09-25', description: 'KREDI KARTI BORC ODEMESI', merchant: 'KART ODEMESI', amount: 66_500, direction: 'out', type: 'own_transfer', category: 'Transfer / Kart Ödemesi' }),
    tx({ date: '2026-09-30', description: 'KMH FAIZ TAHAKKUKU', merchant: 'KMH FAIZ', amount: 140, direction: 'out', type: 'interest', category: 'Faiz & Banka Ücretleri' }),
    tx({ date: '2026-09-30', description: 'BSMV', merchant: 'BSMV', amount: 43, direction: 'out', type: 'tax', category: 'Faiz & Banka Ücretleri' }),
  ],
}

// YKB World: bir satır eksik okunmuş (ADOBE 1.150) → toplam tutmaz; kontrol turu ekler.
// Ayrıca Worldpuan satırı yanlışlıkla işlem olarak okunmuş (kontrol turu siler).
export const ykbMissingRow: ParsedStatement = {
  ...base,
  bank: null,
  card_brand: 'World Card',
  account_type: 'credit_card',
  account_name: 'Yapı Kredi World',
  last4: '1907',
  credit_limit: 45_000,
  period_start: '2026-08-06',
  period_end: '2026-09-05',
  due_date: '2026-09-15',
  previous_balance: 20_000,
  total_debt: 24_150,
  transactions: [
    tx({ date: '2026-08-10', description: 'ODEME-TESEKKUR EDERIZ', amount: 20_000, direction: 'in', type: 'payment', category: 'Transfer / Kart Ödemesi' }),
    tx({ date: '2026-08-12', description: 'A101 ALANYA', merchant: 'A101', amount: 3_000, direction: 'out', type: 'purchase', category: 'Market' }),
    tx({ date: '2026-08-20', description: 'IKEA 2/6', merchant: 'IKEA', amount: 3_200, direction: 'out', type: 'installment', installment_no: 2, installment_total: 6, category: 'Ev & Yaşam' }),
    tx({ date: '2026-08-21', description: 'WORLDPUAN KAZANIM', merchant: 'WORLDPUAN', amount: 300, direction: 'in', type: 'other_in', category: 'Diğer Gelir', confidence: 'low' }),
    tx({ date: '2026-09-01', description: 'PEGASUS HAVA YOLLARI', merchant: 'PEGASUS', amount: 16_800, direction: 'out', type: 'purchase', category: 'Seyahat' }),
  ],
}
