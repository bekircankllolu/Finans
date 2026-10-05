import type { NextRequest } from 'next/server'
import { runParseJob } from '@/lib/finans/statementJobs'
import { errorResponse, getFinanceUser } from '@/lib/finans/server'
import { sseResponse } from '@/lib/finans/sse'

// Opus ile uzun ekstreler birkaç dakika sürebilir
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/finans/statements/[id]/parse'>) {
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
  if (st.status === 'confirmed') return Response.json({ error: 'Bu ekstre zaten onaylandı' }, { status: 409 })

  return sseResponse(async send => {
    await supabase.from('fin_statements').update({ status: 'parsing', error: null }).eq('id', id)
    try {
      const result = await runParseJob(supabase, user.id, st, (step, message) => send({ type: 'progress', step, message }))
      const { error } = await supabase
        .from('fin_statements')
        .update({ status: 'parsed', parsed: result.parsed, account_id: result.accountId ?? st.account_id })
        .eq('id', id)
      if (error) throw new Error(error.message)
      send({ type: 'done', needsVerify: result.needsVerify })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Okuma hatası'
      await supabase.from('fin_statements').update({ status: 'failed', error: message }).eq('id', id)
      throw err
    }
  })
}
