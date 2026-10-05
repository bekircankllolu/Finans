import type { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { ConfirmLoanInput, ConfirmStatementInput, confirmLoanSchedule, confirmStatement } from '@/lib/finans/statements'
import { errorResponse, getFinanceUser } from '@/lib/finans/server'

export async function POST(request: NextRequest, ctx: RouteContext<'/api/finans/statements/[id]/confirm'>) {
  const { id } = await ctx.params
  try {
    const { supabase } = await getFinanceUser()
    const { data: st } = await supabase.from('fin_statements').select('kind, status').eq('id', id).single()
    if (!st) return Response.json({ error: 'Ekstre bulunamadı' }, { status: 404 })
    if (st.status === 'confirmed') return Response.json({ error: 'Bu ekstre zaten onaylandı' }, { status: 409 })

    const body = await request.json()
    const result =
      st.kind === 'loan_schedule'
        ? await confirmLoanSchedule(supabase, id, ConfirmLoanInput.parse(body))
        : await confirmStatement(supabase, id, ConfirmStatementInput.parse(body))
    revalidatePath('/finans', 'layout')
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
