import type { CategoryKind } from './types'
import { LOAN_PAYMENT_CATEGORY } from './calc/cashflow'

export const TRANSFER_CATEGORY = 'Transfer / Kart Ödemesi'

// İlk girişte kullanıcıya eklenen kategoriler. İsimler AI kategorizasyonunda da aynen kullanılır.
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; is_fixed?: boolean }[] = [
  { name: 'Market', kind: 'expense' },
  { name: 'Yeme-İçme', kind: 'expense' },
  { name: 'Ulaşım & Akaryakıt', kind: 'expense' },
  { name: 'Faturalar', kind: 'expense', is_fixed: true },
  { name: 'Kira & Aidat', kind: 'expense', is_fixed: true },
  { name: 'Abonelikler', kind: 'expense', is_fixed: true },
  { name: 'Sağlık', kind: 'expense' },
  { name: 'Giyim & Bakım', kind: 'expense' },
  { name: 'Eğlence & Hobi', kind: 'expense' },
  { name: 'Seyahat', kind: 'expense' },
  { name: 'Eğitim', kind: 'expense' },
  { name: 'Teknoloji & Elektronik', kind: 'expense' },
  { name: 'Ev & Yaşam', kind: 'expense' },
  { name: 'Online Alışveriş', kind: 'expense' },
  { name: 'Nakit Çekim', kind: 'expense' },
  { name: 'Faiz & Banka Ücretleri', kind: 'expense' },
  { name: 'Vergi & Resmi', kind: 'expense' },
  { name: LOAN_PAYMENT_CATEGORY, kind: 'expense', is_fixed: true },
  { name: 'Diğer Gider', kind: 'expense' },
  { name: 'Maaş', kind: 'income' },
  { name: 'Freelance', kind: 'income' },
  { name: 'Kira Geliri', kind: 'income' },
  { name: 'Faiz & Yatırım Getirisi', kind: 'income' },
  { name: 'Diğer Gelir', kind: 'income' },
  { name: TRANSFER_CATEGORY, kind: 'transfer' },
  { name: 'Kredi Kullanımı', kind: 'transfer' },
  { name: 'Birikim / Yatırım Transferi', kind: 'transfer' },
]

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Kredi kartı',
  checking: 'Vadesiz hesap',
  kmh: 'KMH',
  savings: 'Vadeli / birikim',
  investment: 'Yatırım hesabı',
  cash: 'Nakit',
}

export const ASSET_LABELS: Record<string, string> = {
  TRY: 'TL',
  USD: 'Dolar',
  EUR: 'Euro',
  GBP: 'Sterlin',
  XAU: 'Gram altın',
  FUND: 'Fon',
  BES: 'BES',
  STOCK: 'Hisse',
  OTHER: 'Diğer',
}

export const INCOME_KIND_LABELS: Record<string, string> = {
  salary: 'Maaş',
  freelance: 'Freelance',
  rent: 'Kira',
  other: 'Diğer',
}
