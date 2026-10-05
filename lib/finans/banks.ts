// Türk bankaları ve kart markaları bilgi tabanı. AI prompt'una ipucu olarak girer,
// banka tanıma ve öğrenilmiş banka kurallarının anahtarı olarak kullanılır.

export interface BankProfile {
  id: string
  name: string
  aliases: string[]
  cards: string[]
  hints: string[]
}

export const BANKS: BankProfile[] = [
  {
    id: 'garanti',
    name: 'Garanti BBVA',
    aliases: ['garanti', 'garanti bbva', 'garanti bankası', 't. garanti'],
    cards: ['bonus', 'bonus flexi', 'miles&smiles', 'miles & smiles', 'shop&fly', 'money bonus', 'american express'],
    hints: [
      'Kart ekstresinde "Önceki Dönem Borcu", "Dönem Borcu", "Asgari Ödeme Tutarı", "Son Ödeme Tarihi" alanları özet kutusundadır.',
      'Taksitli işlemler "x/y" veya "Taksit x/y" biçimindedir; satırdaki tutar o ayki taksit tutarıdır.',
      '"Bonus" kazanım/kullanım satırları (tutar yerine puan) işlem değildir; bonus ile ödenen kısım iade gibi giriş olarak görünebilir.',
      'Karta yapılan ödemeler "ÖDEME", "HESAPTAN ÖDEME", "OTOMATİK ÖDEME" açıklamasıyla eksi/alacak olarak görünür.',
    ],
  },
  {
    id: 'yapikredi',
    name: 'Yapı Kredi',
    aliases: ['yapı kredi', 'yapi kredi', 'ykb', 'yapı ve kredi'],
    cards: ['world', 'worldcard', 'world card', 'adios', 'play', 'crystal', 'opet worldcard'],
    hints: [
      '"Worldpuan" satırları para hareketi değildir; worldpuan ile ödeme ayrıca giriş olarak görünebilir.',
      'Taksitli işlemler "x. taksit / y" biçimindedir; ekstre ayrıca kalan taksit toplamını gösterebilir, bu işlem değildir.',
      'Özet tabloda "Önceki Ekstre Borcu", "Ödemeleriniz", "Harcamalarınız", "Dönem Borcu" yer alır.',
    ],
  },
  {
    id: 'isbank',
    name: 'İş Bankası',
    aliases: ['iş bankası', 'is bankasi', 'türkiye iş bankası', 'isbank', 'işbank'],
    cards: ['maximum', 'maximiles', 'maximum pati', 'maximum genç'],
    hints: [
      '"MaxiPuan" satırları para hareketi değildir.',
      'Vadesiz hesap dökümünde "Borç" kolonu çıkış (out), "Alacak" kolonu giriş (in) anlamına gelir; "Bakiye" kolonu tutar değildir.',
    ],
  },
  {
    id: 'akbank',
    name: 'Akbank',
    aliases: ['akbank', 'akbank t.a.ş.'],
    cards: ['axess', 'wings', 'neo', 'free'],
    hints: ['"Chip-para" satırları puan hareketidir, işlem değildir; chip-para ile ödeme giriş olarak görünebilir.'],
  },
  {
    id: 'qnb',
    name: 'QNB',
    aliases: ['qnb', 'qnb finansbank', 'finansbank', 'enpara'],
    cards: ['cardfinans', 'card finans', 'enpara kart', 'enpara.com kredi kartı'],
    hints: [
      'Enpara hesap hareketlerinde tutar işaretlidir: eksi çıkış (out), artı giriş (in).',
      '"ParaPuan" satırları işlem değildir.',
    ],
  },
  {
    id: 'ziraat',
    name: 'Ziraat Bankası',
    aliases: ['ziraat', 'ziraat bankası', 't.c. ziraat'],
    cards: ['bankkart', 'bankkart combo', 'bankkart genç'],
    hints: ['"Bankkart Lira" satırları puan hareketidir, işlem değildir.'],
  },
  {
    id: 'halkbank',
    name: 'Halkbank',
    aliases: ['halkbank', 'halk bankası', 'türkiye halk bankası'],
    cards: ['paraf', 'parafly', 'paraf genç'],
    hints: ['"ParafPara" satırları puan hareketidir, işlem değildir.'],
  },
  {
    id: 'vakifbank',
    name: 'VakıfBank',
    aliases: ['vakıfbank', 'vakifbank', 'vakıflar bankası', 'türkiye vakıflar'],
    cards: ['vakıfbank worldcard', 'rail&miles', 'platinum'],
    hints: ['"Worldpuan" satırları para hareketi değildir.'],
  },
  {
    id: 'denizbank',
    name: 'DenizBank',
    aliases: ['denizbank', 'deniz bank', 'fastpay'],
    cards: ['bonus', 'denizbank bonus', 'deniz bonus'],
    hints: ['DenizBank da Bonus markası kullanır; bankayı logodan/başlıktan ayırt et.'],
  },
  {
    id: 'teb',
    name: 'TEB',
    aliases: ['teb', 'türk ekonomi bankası', 'cepteteb'],
    cards: ['bonus', 'teb bonus', 'cepteteb'],
    hints: ['TEB de Bonus markası kullanır; bankayı başlıktan ayırt et.'],
  },
  { id: 'ing', name: 'ING', aliases: ['ing', 'ing bank'], cards: ['bonus', 'ing bonus'], hints: [] },
  { id: 'kuveytturk', name: 'Kuveyt Türk', aliases: ['kuveyt türk', 'kuveyt turk'], cards: ['sağlam kart', 'saglam kart'], hints: [] },
  { id: 'albaraka', name: 'Albaraka', aliases: ['albaraka', 'albaraka türk'], cards: ['worldcard'], hints: [] },
  { id: 'sekerbank', name: 'Şekerbank', aliases: ['şekerbank', 'sekerbank'], cards: ['bonus'], hints: [] },
  { id: 'hsbc', name: 'HSBC', aliases: ['hsbc'], cards: ['advantage'], hints: [] },
  { id: 'odeabank', name: 'Odeabank', aliases: ['odeabank', 'odea'], cards: ['bank\'o card'], hints: [] },
  { id: 'fibabanka', name: 'Fibabanka', aliases: ['fibabanka'], cards: [], hints: [] },
  { id: 'papara', name: 'Papara', aliases: ['papara'], cards: ['papara kart', 'papara card'], hints: [] },
]

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()

// Önce banka adı/alias, sonra kart markası. Bonus gibi birden çok bankada olan markalarda
// banka adı yoksa Garanti varsayılır (en yaygın).
export function detectBank(...texts: (string | null | undefined)[]): BankProfile | null {
  const hay = norm(texts.filter(Boolean).join(' | '))
  if (!hay) return null
  const byAlias = BANKS.flatMap(b => b.aliases.map(a => ({ b, a })))
    .filter(({ a }) => new RegExp(`(^|[^\\p{L}])${escape(a)}([^\\p{L}]|$)`, 'u').test(hay))
    .sort((x, y) => y.a.length - x.a.length)[0]
  if (byAlias) return byAlias.b
  const byCard = BANKS.flatMap(b => b.cards.map(c => ({ b, c })))
    .filter(({ c }) => hay.includes(c))
    .sort((x, y) => y.c.length - x.c.length)[0]
  return byCard?.b ?? null
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function bankById(id: string | null | undefined): BankProfile | null {
  return id ? (BANKS.find(b => b.id === id) ?? null) : null
}

// Prompt'a giren kısa özet: tüm bankaların marka eşlemesi + ipuçları
export function bankKnowledgeForPrompt(): string {
  return BANKS.map(b => {
    const cards = b.cards.length ? ` (kartlar: ${b.cards.join(', ')})` : ''
    const hints = b.hints.length ? `\n  - ${b.hints.join('\n  - ')}` : ''
    return `• ${b.name}${cards}${hints}`
  }).join('\n')
}
