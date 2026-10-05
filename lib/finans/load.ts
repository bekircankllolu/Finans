import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { buildSnapshot } from './calc/snapshot'
import { todayISO } from './calc/dates'
import { DEMO_USER, demoData, demoSupabase, isDemoMode } from './demo'
import { FinanceAuthError, getFinanceUser, loadFinanceData } from './server'

// Aynı istek içinde layout ve sayfa veriyi tek seferde yükler
export const getFinanceContext = cache(async () => {
  if (isDemoMode()) return { supabase: demoSupabase(), user: DEMO_USER }
  try {
    return await getFinanceUser()
  } catch (err) {
    if (err instanceof FinanceAuthError && err.status === 401) redirect('/auth/login?next=/finans')
    throw err
  }
})

export const getFinanceSnapshot = cache(async () => {
  const { supabase, user } = await getFinanceContext()
  const data = isDemoMode() ? demoData() : await loadFinanceData(supabase, user.id)
  const snapshot = buildSnapshot(data, todayISO())
  return { data, snapshot }
})
