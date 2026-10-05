import type { NextRequest } from 'next/server'
import { runVerifyJob } from '@/lib/finans/statementJobs'
import { errorResponse, getFinanceUser } from '@/lib/finans/server'
import { sseResponse } from '@/lib/finans/sse'

// Toplamlar tutmadığında ayrı bir istekle çalışan AI kontrol turu (okuma süresine eklenmesin diye)
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/finans/statements/[id]/verify'>) {
  const { id } = await ctx.params
  let auth: Awaited<ReturnType<typeof getFinanceUser>>
  try {
    auth = await getFinanceUser()
  } catch (err) {
    return errorResponse(err)
  }
  const { supabase, user } = auth
  const { data: st } = await supabase.from('fin_statements').select('*').eq('id', id).single()
  if (!st) return Response.json({ error: 'Ekstre bulunamadı' }, { status: 404 })
  if (st.status !== 'parsed') return Response.json({ error: 'Ekstre kontrol için hazır değil' }, { status: 409 })

  return sseResponse(async send => {
    const result = await runVerifyJob(supabase, user.id, st, (step, message) => send({ type: 'progress', step, message }))
    const { error } = await supabase.from('fin_statements').update({ parsed: result.parsed }).eq('id', id)
    if (error) throw new Error(error.message)
    send({ type: 'done', needsVerify: false })
  })
}
