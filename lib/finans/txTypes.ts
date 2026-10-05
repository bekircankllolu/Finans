import { LOAN_PAYMENT_CATEGORY } from './calc/cashflow'
import { TRANSFER_CATEGORY } from './defaults'

// AI'nın her satıra verdiği işlem tipi. Kategori ve gelir/gider sayımı bu tipe göre deterministik yapılır.
export const TX_TYPES = [
  'purchase', // tek çekim harcama
  'installment', // taksitli harcamanın bu ayki taksiti
  'fx_purchase', // yurt dışı / döviz harcama (TL karşılığı)
  'refund', // iade
  'payment', // karta yapılan ödeme
  'own_transfer', // kendi hesapları arası virman / kart borcu ödeme çıkışı
  'eft_in', // başkasından gelen havale/EFT/FAST
  'eft_out', // başkasına giden havale/EFT/FAST (kira, borç vb.)
  'salary', // maaş
  'cash_advance', // kredi kartından nakit avans
  'cash_withdrawal', // ATM'den para çekme
  'interest', // akdi/gecikme/KMH faizi
  'fee', // kart aidatı, hesap işletim, EFT ücreti
  'tax', // BSMV, KKDF, damga vergisi, MTV vb.
  'loan_payment', // kredi taksiti tahsilatı
  'loan_disbursement', // kredi kullandırımı
  'investment', // döviz/altın/fon alım-satım
  'other_in',
  'other_out',
] as const

export type TxType = (typeof TX_TYPES)[number]

export const TX_TYPE_LABELS: Record<TxType, string> = {
  purchase: 'Harcama',
  installment: 'Taksit',
  fx_purchase: 'Döviz harcama',
  refund: 'İade',
  payment: 'Kart ödemesi',
  own_transfer: 'Virman',
  eft_in: 'Gelen EFT',
  eft_out: 'Giden EFT',
  salary: 'Maaş',
  cash_advance: 'Nakit avans',
  cash_withdrawal: 'Nakit çekim',
  interest: 'Faiz',
  fee: 'Ücret',
  tax: 'Vergi',
  loan_payment: 'Kredi taksiti',
  loan_disbursement: 'Kredi kullanımı',
  investment: 'Yatırım',
  other_in: 'Diğer giriş',
  other_out: 'Diğer çıkış',
}

// Tipi kesin olan işlemlerin kategorisi; diğerlerinde null döner ve sözlük/AI kararı geçerli olur.
export function categoryForType(type: TxType, description = ''): string | null {
  switch (type) {
    case 'payment':
    case 'own_transfer':
      return TRANSFER_CATEGORY
    case 'investment':
      return 'Birikim / Yatırım Transferi'
    case 'loan_disbursement':
      return 'Kredi Kullanımı'
    case 'loan_payment':
      return LOAN_PAYMENT_CATEGORY
    case 'interest':
    case 'fee':
      return 'Faiz & Banka Ücretleri'
    case 'tax':
      return /BSMV|KKDF|DAMGA/i.test(description) ? 'Faiz & Banka Ücretleri' : null
    case 'cash_advance':
    case 'cash_withdrawal':
      return 'Nakit Çekim'
    case 'salary':
      return 'Maaş'
    default:
      return null
  }
}
