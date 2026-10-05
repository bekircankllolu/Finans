import { createClient as createAdminClient } from '@supabase/supabase-js'
import { fetchLiveRates } from '@/lib/finans/fx'

// Vercel Cron: günlük kur güncellemesi. CRON_SECRET ile korunur.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return Response.json({ error: 'Supabase env eksik' }, { status: 500 })

  const rates = await fetchLiveRates()
  const now = new Date().toISOString()
  const rows = Object.entries(rates).map(([code, rate_try]) => ({ code, rate_try, updated_at: now }))
  if (rows.length) {
    const { error } = await createAdminClient(url, key).from('fin_fx_rates').upsert(rows)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ updated: rows.map(r => r.code) })
}
