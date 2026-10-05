import type { SupabaseClient } from '@supabase/supabase-js'
import type { FxRates } from './types'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
// Gram altın için ücretsiz, anahtarsız kaynak
const GOLD_URL = 'https://finans.truncgil.com/v4/today.json'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

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

// Cache'teki kurları döner; eskiyse canlıdan yeniler. Ağ hatasında eski değerlerle devam eder.
export async function getRates(supabase: SupabaseClient, force = false): Promise<{ rates: FxRates; updatedAt: string | null }> {
  const { data } = await supabase.from('fin_fx_rates').select('code, rate_try, updated_at')
  const cached: FxRates = {}
  let oldest: number | null = null
  for (const row of data ?? []) {
    cached[row.code as keyof FxRates] = Number(row.rate_try)
    const t = new Date(row.updated_at).getTime()
    oldest = oldest == null ? t : Math.min(oldest, t)
  }

  const stale = force || oldest == null || Date.now() - oldest > MAX_AGE_MS
  if (!stale) return { rates: cached, updatedAt: oldest ? new Date(oldest).toISOString() : null }

  try {
    const live = await fetchLiveRates()
    const now = new Date().toISOString()
    const rows = Object.entries(live).map(([code, rate_try]) => ({ code, rate_try, updated_at: now }))
    if (rows.length) await supabase.from('fin_fx_rates').upsert(rows)
    return { rates: { ...cached, ...live }, updatedAt: rows.length ? now : oldest ? new Date(oldest).toISOString() : null }
  } catch {
    return { rates: cached, updatedAt: oldest ? new Date(oldest).toISOString() : null }
  }
}
