// Türkiye'de yaygın işyerleri → varsayılan kategori adı (lib/finans/defaults.ts ile aynı adlar).
// Öncelik: kullanıcının öğrenilmiş kuralı > işlem tipi > bu sözlük > AI tahmini.
// Kalıplar normalize edilmiş (büyük harf) işyeri adında "içerir" olarak aranır; uzun kalıp önce eşleşir.

const DICTIONARY: Record<string, string[]> = {
  Market: [
    'MIGROS', 'MİGROS', 'MACROCENTER', 'CARREFOUR', 'CARREFOURSA', 'A101', 'BIM ', 'BİM ', 'BIM BIRLESIK', 'BİM BİRLEŞİK',
    'SOK MARKET', 'ŞOK MARKET', 'ŞOK ', 'FILE MARKET', 'METRO GROSS', 'METRO TOPTAN', 'HAKMAR', 'ONUR MARKET', 'TARIM KREDI',
    'TARIM KREDİ', 'KİPA', 'KIPA', 'GETIR BUYUK', 'GETİR BÜYÜK', 'ISTEGELSIN', 'İSTEGELSİN', 'YUNUS MARKET', 'BIZIM TOPTAN',
  ],
  'Yeme-İçme': [
    'YEMEKSEPETI', 'YEMEKSEPETİ', 'GETIR YEMEK', 'GETİR YEMEK', 'TRENDYOL YEMEK', 'MIGROS YEMEK', 'STARBUCKS', 'KAHVE DUNYASI',
    'KAHVE DÜNYASI', 'BURGER KING', 'MCDONALDS', "MCDONALD'S", 'DOMINOS', "DOMINO'S", 'PIZZA HUT', 'POPEYES', 'KFC', 'SIMIT SARAYI',
    'SİMİT SARAYI', 'TAVUK DUNYASI', 'TAVUK DÜNYASI', 'CAFE', 'KAFE', 'RESTAURANT', 'RESTORAN', 'LOKANTA', 'BAKLAVA', 'PASTANE',
    'BURGER', 'KEBAP', 'DÖNER', 'DONER', 'PIDE', 'PİDE', 'ESPRESSOLAB', 'CAFFE NERO', 'GLORIA JEANS', 'MADO',
  ],
  'Ulaşım & Akaryakıt': [
    'SHELL', 'OPET', 'PETROL OFISI', 'PETROL OFİSİ', ' PO ', 'BP ', 'TOTAL', 'TOTALENERGIES', 'AYTEMIZ', 'AYTEMİZ', 'LUKOIL',
    'ALPET', 'TP PETROL', 'KADOOIL', 'ISTANBULKART', 'İSTANBULKART', 'BITAKSI', 'BİTAKSİ', 'UBER', 'MARTI', 'HGS', 'OGS',
    'OTOPARK', 'ISPARK', 'İSPARK', 'TCDD', 'METRO ISTANBUL', 'BELBIM', 'BELBİM', 'KENTKART', 'ANTALYAKART',
  ],
  Faturalar: [
    'TURKCELL', 'VODAFONE', 'TURK TELEKOM', 'TÜRK TELEKOM', 'TTNET', 'SUPERONLINE', 'TURKNET', 'ENERJISA', 'ENERJİSA', 'CK ENERJI',
    'CK ENERJİ', 'AYEDAS', 'BEDAS', 'TOROSLAR', 'AKDENIZ ELEKTRIK', 'AKDENİZ ELEKTRİK', 'IGDAS', 'İGDAŞ', 'IGDAŞ', 'ISKI', 'İSKİ',
    'ASAT', 'DOGALGAZ', 'DOĞALGAZ', 'AKSA', 'BASKENTGAZ', 'BAŞKENTGAZ', 'ELEKTRIK', 'ELEKTRİK', 'SU IDARESI', 'SU İDARESİ',
  ],
  Abonelikler: [
    'NETFLIX', 'SPOTIFY', 'YOUTUBE', 'GOOGLE ONE', 'GOOGLE *', 'APPLE.COM', 'ITUNES', 'ICLOUD', 'DISNEY', 'PRIME VIDEO', 'AMAZON PRIME',
    'BLUTV', 'EXXEN', 'GAIN', 'TOD ', 'BEIN', 'DIGITURK', 'D-SMART', 'ADOBE', 'CANVA', 'CHATGPT', 'OPENAI', 'ANTHROPIC', 'CLAUDE.AI',
    'MIDJOURNEY', 'NOTION', 'DROPBOX', 'MICROSOFT', 'XBOX', 'PLAYSTATION', 'STEAM', 'FIGMA', 'GITHUB', 'VERCEL',
  ],
  Sağlık: ['ECZANE', 'ECZA', 'HASTANE', 'HASTANESI', 'HASTANESİ', 'TIP MERKEZI', 'TIP MERKEZİ', 'DIS KLINIGI', 'DİŞ KLİNİĞİ', 'ACIBADEM', 'MEDICAL PARK', 'MEMORIAL', 'LABORATUVAR'],
  'Giyim & Bakım': [
    'ZARA', 'H&M', 'MANGO', 'LC WAIKIKI', 'KOTON', 'DEFACTO', 'MAVI', 'MAVİ', 'BERSHKA', 'PULL&BEAR', 'STRADIVARIUS', 'NIKE', 'ADIDAS',
    'FLO ', 'INTERSPORT', 'DECATHLON', 'BOYNER', 'WATSONS', 'GRATIS', 'ROSSMANN', 'SEPHORA', 'KUAFOR', 'KUAFÖR', 'BERBER', 'VAKKO',
    'BEYMEN', 'NETWORK', 'COLINS', 'COLIN\'S', 'PENTI', 'PENTİ',
  ],
  'Eğlence & Hobi': ['SINEMA', 'SİNEMA', 'CINEMAXIMUM', 'PARIBU', 'BILETIX', 'BİLETİX', 'PASSO', 'MOBILET', 'KONSER', 'TIYATRO', 'TİYATRO', 'D&R', 'KITAPYURDU', 'KİTAPYURDU', 'IDEFIX'],
  Seyahat: [
    'PEGASUS', 'THY', 'TURK HAVA YOLLARI', 'TÜRK HAVA YOLLARI', 'AJET', 'SUNEXPRESS', 'ANADOLUJET', 'BOOKING', 'AIRBNB', 'HOTELS.COM',
    'OBILET', 'ENUYGUN', 'ETSTUR', 'JOLLY', 'OTEL', 'HOTEL', 'TATILSEPETI', 'TATİLSEPETİ', 'TATILBUDUR', 'METRO TURIZM', 'KAMIL KOC', 'KAMİL KOÇ', 'PAMUKKALE TURIZM',
  ],
  Eğitim: ['UDEMY', 'COURSERA', 'OKUL', 'UNIVERSITE', 'ÜNİVERSİTE', 'KURS', 'DERSHANE', 'DOMESTIKA', 'SKILLSHARE'],
  'Teknoloji & Elektronik': ['MEDIAMARKT', 'MEDIA MARKT', 'TEKNOSA', 'VATAN BILGISAYAR', 'VATAN BİLGİSAYAR', 'APPLE STORE', 'SAMSUNG', 'ITOPYA', 'İTOPYA', 'XIAOMI'],
  'Ev & Yaşam': ['IKEA', 'KOCTAS', 'KOÇTAŞ', 'BAUHAUS', 'ENGLISH HOME', 'MADAME COCO', 'KARACA', 'TAÇ ', 'TAC ', 'MUDO', 'ISTIKBAL', 'İSTİKBAL', 'BELLONA', 'EVIDEA', 'EVİDEA'],
  'Online Alışveriş': ['TRENDYOL', 'HEPSIBURADA', 'N11', 'AMAZON', 'CICEKSEPETI', 'ÇİÇEKSEPETİ', 'TEMU', 'SHEIN', 'ALIEXPRESS', 'PAZARAMA', 'MORHIPO', 'IYZICO', 'İYZİCO', 'PAYTR', 'SHOPIER'],
  'Vergi & Resmi': ['GIB ', 'GİB ', 'VERGI DAIRESI', 'VERGİ DAİRESİ', 'MTV', 'TRAFIK CEZASI', 'TRAFİK CEZASI', 'NOTER', 'TAPU', 'E-DEVLET', 'NUFUS MUDURLUGU', 'NÜFUS MÜDÜRLÜĞÜ', 'PASAPORT', 'SGK', 'BAĞ-KUR', 'BAG-KUR'],
}

const ENTRIES = Object.entries(DICTIONARY)
  .flatMap(([category, patterns]) => patterns.map(p => ({ pattern: p.toLocaleUpperCase('tr-TR'), category })))
  .sort((a, b) => b.pattern.trim().length - a.pattern.trim().length)

// Eşleşen varsayılan kategori adını döner (yoksa null)
export function dictionaryCategory(merchant: string, description = ''): string | null {
  const hay = ` ${`${merchant} ${description}`.toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ')} `
  for (const e of ENTRIES) {
    // Boşluklu kalıplar (ör. ' PO ') kelime sınırı gibi çalışır; hay iki uçtan boşlukla çevrili
    if (hay.includes(e.pattern)) return e.category
  }
  return null
}
