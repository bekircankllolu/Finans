import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FxRates } from './types'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
// Gram altın için ücretsiz, anahtarsız kaynak
const GOLD_URL = 'https://finans.truncgil.com/v4/today.json'
const STALE_MS = 26 * 60 * 60 * 1000

function parseTcmb(xml: string): FxRates {
  const rates: FxRates = {}
  for (const code of ['USD', 'EUR', 'GBP'] as const) {
    const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?</Currency>`))?.[0]
    const selling = block?.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1]
    if (selling) rates[code] = Number(selling)
  }
  return rates
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' })
}

export async function fetchLiveRates(): Promise<FxRates> {
  const rates: FxRates = {}
  const [tcmb, gold] = await Promise.allSettled([
    fetchWithTimeout(TCMB_URL).then(r => (r.ok ? r.text() : Promise.reject(new Error(`TCMB ${r.status}`)))),
    fetchWithTimeout(GOLD_URL).then(r => (r.ok ? r.json() : Promise.reject(new Error(`gold ${r.status}`)))),
  ])
  if (tcmb.status === 'fulfilled') Object.assign(rates, parseTcmb(tcmb.value))
  if (gold.status === 'fulfilled') {
    const g = (gold.value as Record<string, { Selling?: number | string }>)['GRA']
    const selling = Number(String(g?.Selling ?? '').replace(',', '.'))
    if (selling > 0) rates.XAU = selling
  }
  return rates
}

export interface RatesResult {
  rates: FxRates
  updatedAt: string | null
}

async function readCache(supabase: SupabaseClient): Promise<RatesResult & { oldest: number | null }> {
  const { data } = await supabase.from('fin_fx_rates').select('code, rate_try, updated_at')
  const rates: FxRates = {}
  let oldest: number | null = null
  for (const row of data ?? []) {
    rates[row.code as keyof FxRates] = Number(row.rate_try)
    const t = new Date(row.updated_at).getTime()
    oldest = oldest == null ? t : Math.min(oldest, t)
  }
  return { rates, oldest, updatedAt: oldest ? new Date(oldest).toISOString() : null }
}

// Canlı kaynaktan çekip cache'e yazar. Ağ hatasında eski değerlerle devam eder.
export async function refreshRates(supabase: SupabaseClient): Promise<RatesResult> {
  const cached = await readCache(supabase)
  try {
    const live = await fetchLiveRates()
    const now = new Date().toISOString()
    const rows = Object.entries(live).map(([code, rate_try]) => ({ code, rate_try, updated_at: now }))
    if (rows.length) await supabase.from('fin_fx_rates').upsert(rows)
    return { rates: { ...cached.rates, ...live }, updatedAt: rows.length ? now : cached.updatedAt }
  } catch {
    return { rates: cached.rates, updatedAt: cached.updatedAt }
  }
}

// İstek yolunda sadece cache okunur; kur hiç beklenmez. Cache eskiyse yenileme yanıt
// gönderildikten sonra arka planda yapılır (asıl tazeleme günlük cron'da).
export async function getRates(supabase: SupabaseClient): Promise<RatesResult> {
  const cached = await readCache(supabase)
  if (cached.oldest == null || Date.now() - cached.oldest > STALE_MS) {
    after(() => refreshRates(supabase).catch(() => undefined))
  }
  return { rates: cached.rates, updatedAt: cached.updatedAt }
}
