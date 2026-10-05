# Finans

Kişisel finans takip aracı. Aylık banka ve kredi kartı ekstrelerini yükle; AI okusun ve kategorize etsin. Gelir, gider, borç, kredi, taksit ve varlıklarını tek panelde gör, aylık rapor ve tavsiye al.

## Özellikler

- **Ekstre yükleme:** PDF, Excel (.xlsx), CSV veya ekran görüntüsü; aynı ekstrenin birden fazla sayfası/ekran görüntüsü tek ekstre olarak okunur. Adım adım sihirbaz: yükle → canlı analiz → orijinal belgeyle yan yana kontrol → kaydet. Aynı işlem iki kez eklenmez; kart/IBAN numaraları maskelenir.
- **Doğru okuma:** Banka/kart markası tanıma (`lib/finans/banks.ts`), TR işyeri sözlüğü, işlem türleri (taksit, nakit avans, faiz, ödeme, iade…). Ekstrenin kendi toplamlarıyla uzlaştırma (kart: önceki borç + harcamalar − ödemeler = dönem borcu; vadesiz: açılış + giriş − çıkış = kapanış). Fark varsa AI otomatik ikinci kontrol yapar.
- **Öğrenme:** Onayda değiştirdiğin kategoriler işyeri kuralı, çevirdiğin yönler ve çıkardığın satırlar banka kuralı olarak kaydedilir; sonraki ekstrelerde otomatik uygulanır (Ayarlar'dan yönetilir).
- **Özet:** Takvim ayı veya kart hesap kesim dönemi bazında gelir, gider, borç, kategori, banka/kart kırılımı, en çok harcanan yerler, yaklaşan ödemeler, trend ve uyarılar tek ekranda. Açık/koyu tema.
- **Borçlar:** Kart limit/asgari/son ödeme, KMH, kredi ödeme planı (PDF'ten veya manuel; KKDF/BSMV dahil), kart taksitleri, erken kapama tahmini, çığ/kartopu borç kapatma simülatörü.
- **Bütçe & hedefler:** Kategori limitleri, birikim hedefleri, 6 aylık nakit akışı tahmini, finansal sağlık skoru.
- **AI:** Aylık rapor (ne değişti, kaçaklar, aksiyon planı) ve verine erişen sohbet danışmanı ("araba alırsam ne olur?" simülasyonu dahil).
- **Uyarılar:** Son ödeme, bütçe aşımı, limit doluluğu, KMH, harcama sıçraması, eksiye düşen nakit akışı, düzenli ödemeler/abonelikler.
- **Döviz/altın:** TCMB kurları + gram altın, günlük cron; erişilemezse elle kur girilebilir.

Tüm hesaplar `lib/finans/calc/` altında deterministik TypeScript ile yapılır; AI sadece bu rakamları yorumlar.

## Teknoloji

- Next.js 16 (App Router) + Tailwind CSS 4 + Recharts
- Supabase (Auth magic link, Postgres + RLS, Storage)
- Claude API (`@anthropic-ai/sdk`): ekstre okuma + ikinci kontrol ve aylık rapor `claude-opus-5-5`, danışman ve kredi planı `claude-sonnet-5-5`
- Vercel (deploy + cron)

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldur
```

1. Supabase SQL editor'de `supabase/finans_schema.sql` dosyasını çalıştır (tablolar, RLS ve `fin-statements` private storage bucket'ı).
   - Şemayı bu sürümden önce kurduysan bir kez de sırayla `supabase/finans_perf.sql` (hızlı RLS + indeksler) ve `supabase/finans_v3.sql` (ekstre doğrulama kolonları, banka kuralları, işlem türü) çalıştır.
2. Supabase Auth ayarlarında e-posta (magic link) girişini aç; Site URL ve redirect URL'e `https://<alan-adın>/api/auth/callback` ekle.
3. `npm run dev` → `http://localhost:3000` (otomatik `/finans`'a yönlenir).

Arayüzü Supabase olmadan görmek için: `FINANS_DEMO=1 npm run dev` (sadece geliştirmede çalışır).

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Hesap motoru testleri (vitest) |

## Proje yapısı

```
app/
  finans/              # Sayfalar: özet, ekstre, işlemler, borçlar, bütçe, raporlar, danışman, ayarlar
  finans/actions.ts    # Server action'lar (CRUD)
  api/finans/          # Ekstre parse/onay, rapor, sohbet (SSE), kur cron'u
  auth/                # Magic link giriş
components/finans/     # Arayüz bileşenleri ve grafikler
lib/finans/
  calc/                # Deterministik hesaplar (dönem, nakit akışı, kredi, taksit, borç stratejisi, uyarılar) + testler
  ai/                  # Claude: ekstre okuma/doğrulama, aylık rapor, danışman sohbeti
  banks.ts             # Banka ve kart markası bilgi tabanı
  regulations.ts       # KKDF/BSMV, asgari ödeme, faiz sabitleri (tarihli)
  merchants-tr.ts      # TR işyeri → kategori sözlüğü
  reconcile.ts         # Ekstre toplam uzlaştırması
  bankRules.ts         # Öğrenilen banka kuralları
  statementPipeline.ts # Okuma → kurallar → uzlaştırma → ikinci kontrol
  statements.ts        # Ekstre taslağı, tekrar tespiti, onay
  fx.ts                # TCMB + altın kurları
  demo.ts              # Geliştirme için örnek veri
supabase/                # finans_schema.sql (tam şema) + finans_perf.sql, finans_v3.sql (yükseltmeler)
```

## Deploy (Vercel)

Ortam değişkenlerini Vercel'e gir (`SUPABASE_SERVICE_ROLE_KEY` ve `CRON_SECRET` gizli). `vercel.json` fonksiyonları Supabase ile aynı bölgede (`fra1`, Frankfurt) çalıştırır ve günlük kur güncellemesi cron'unu tanımlar. Supabase projen başka bölgedeyse `regions` değerini ona göre değiştir.

### Eski ClipScript tabloları

Supabase projende önceki ClipScript'ten `profiles` ve `generations` tabloları kaldıysa, kullanılmıyorlar. İstersen silebilirsin:

```sql
drop table if exists public.generations;
drop table if exists public.profiles;
```
