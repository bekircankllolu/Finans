# Finans

Kişisel finans takip aracı. Aylık banka ve kredi kartı ekstrelerini yükle; AI okusun ve kategorize etsin. Gelir, gider, borç, kredi, taksit ve varlıklarını tek panelde gör, aylık rapor ve tavsiye al.

## Özellikler

- **Ekstre yükleme:** PDF, Excel (.xlsx), CSV veya ekran görüntüsü. Dosya tarayıcıdan doğrudan Supabase Storage'a gider, Claude okur, onay ekranında düzeltirsin. Aynı işlem iki kez eklenmez; kart/IBAN numaraları maskelenir.
- **Kategori öğrenme:** Onayda değiştirdiğin kategoriler işyeri kuralı olarak kaydedilir, sonraki ekstrelerde otomatik uygulanır.
- **Borçlar:** Kart limit/asgari/son ödeme, KMH, kredi ödeme planı (PDF'ten veya manuel; KKDF/BSMV dahil), kart taksitleri, erken kapama tahmini, çığ/kartopu borç kapatma simülatörü.
- **Bütçe & hedefler:** Kategori limitleri, birikim hedefleri, 6 aylık nakit akışı tahmini, finansal sağlık skoru.
- **AI:** Aylık rapor (ne değişti, kaçaklar, aksiyon planı) ve verine erişen sohbet danışmanı ("araba alırsam ne olur?" simülasyonu dahil).
- **Uyarılar:** Son ödeme, bütçe aşımı, limit doluluğu, KMH, harcama sıçraması, eksiye düşen nakit akışı, düzenli ödemeler/abonelikler.
- **Döviz/altın:** TCMB kurları + gram altın, günlük cron; erişilemezse elle kur girilebilir.

Tüm hesaplar `lib/finans/calc/` altında deterministik TypeScript ile yapılır; AI sadece bu rakamları yorumlar.

## Teknoloji

- Next.js 16 (App Router) + Tailwind CSS 4 + Recharts
- Supabase (Auth magic link, Postgres + RLS, Storage)
- Claude API (`@anthropic-ai/sdk`): ekstre okuma `claude-sonnet-5-5`, rapor ve danışman `claude-opus-5-5`
- Vercel (deploy + cron)

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldur
```

1. Supabase SQL editor'de `supabase/finans_schema.sql` dosyasını çalıştır (tablolar, RLS ve `fin-statements` private storage bucket'ı).
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
  calc/                # Deterministik hesaplar (nakit akışı, kredi, taksit, borç stratejisi, uyarılar) + testler
  ai/                  # Claude: ekstre okuma, aylık rapor, danışman sohbeti
  statements.ts        # Ekstre taslağı, tekrar tespiti, onay
  fx.ts                # TCMB + altın kurları
  demo.ts              # Geliştirme için örnek veri
supabase/finans_schema.sql
```

## Deploy (Vercel)

Ortam değişkenlerini Vercel'e gir (`SUPABASE_SERVICE_ROLE_KEY` ve `CRON_SECRET` gizli). `vercel.json` günlük kur güncellemesi cron'unu tanımlar.

### Eski ClipScript tabloları

Supabase projende önceki ClipScript'ten `profiles` ve `generations` tabloları kaldıysa, kullanılmıyorlar. İstersen silebilirsin:

```sql
drop table if exists public.generations;
drop table if exists public.profiles;
```
