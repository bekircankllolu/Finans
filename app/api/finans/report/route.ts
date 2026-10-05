import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { generateMonthlyReport } from '@/lib/finans/ai/report'
import { snapshotForAI } from '@/lib/finans/ai/context'
import { buildSnapshot } from '@/lib/finans/calc/snapshot'
import { todayISO } from '@/lib/finans/calc/dates'
import { errorResponse, getFinanceUser, loadFinanceData } from '@/lib/finans/server'

export const maxDuration = 300

const Input = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })

export async function POST(request: Request) {
  try {
    const { supabase } = await getFinanceUser()
    const { month: requested } = Input.parse(await request.json().catch(() => ({})))
    const data = await loadFinanceData(supabase)
    const snapshot = buildSnapshot(data, todayISO())
    const month = requested ?? snapshot.focusMonth
    const context = snapshotForAI(snapshot, data)
    const content = await generateMonthlyReport(month, context)
    const metrics = {
      income: snapshot.focus.income,
      expense: snapshot.focus.expense,
      net: snapshot.focus.net,
      netWorth: snapshot.netWorth.netWorth,
      health: snapshot.health.score,
    }
    const { error } = await supabase.from('fin_reports').upsert({ month, content, metrics }, { onConflict: 'user_id,month' })
    if (error) throw new Error(error.message)
    revalidatePath('/finans', 'layout')
    return Response.json({ month })
  } catch (err) {
    return errorResponse(err)
  }
}
