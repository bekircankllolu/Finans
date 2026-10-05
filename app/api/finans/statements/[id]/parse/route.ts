import type { NextRequest } from 'next/server'
import { fileToContent, parseBankStatement, parseLoanSchedule } from '@/lib/finans/ai/parseStatement'
import { buildLoanDraft, buildStatementDraft, guessAccount } from '@/lib/finans/statements'
import { ensureDefaults, errorResponse, getFinanceUser } from '@/lib/finans/server'
import type { Account, Category } from '@/lib/finans/types'

// Uzun PDF ekstreleri birkaç dakika sürebilir
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/finans/statements/[id]/parse'>) {
  const { id } = await ctx.params
  let supabaseRef: Awaited<ReturnType<typeof getFinanceUser>>['supabase'] | null = null
  try {
    const { supabase, user } = await getFinanceUser()
    supabaseRef = supabase
    await ensureDefaults(supabase, user.id)

    const { data: st, error } = await supabase.from('fin_statements').select('*').eq('id', id).single()
    if (error || !st) return Response.json({ error: 'Ekstre bulunamadı' }, { status: 404 })
    if (st.status === 'confirmed') return Response.json({ error: 'Bu ekstre zaten onaylandı' }, { status: 409 })

    await supabase.from('fin_statements').update({ status: 'parsing', error: null }).eq('id', id)

    const { data: blob, error: dlErr } = await supabase.storage.from('fin-statements').download(st.file_path)
    if (dlErr || !blob) throw new Error('Dosya indirilemedi')
    const content = await fileToContent(Buffer.from(await blob.arrayBuffer()), st.mime_type, st.file_name)

    let parsed: object
    let accountId: string | null = st.account_id
    if (st.kind === 'loan_schedule') {
      parsed = buildLoanDraft(await parseLoanSchedule(content))
    } else {
      const [{ data: categories }, { data: rules }, { data: accounts }] = await Promise.all([
        supabase.from('fin_categories').select('*').order('sort'),
        supabase.from('fin_merchant_rules').select('pattern, category_id'),
        supabase.from('fin_accounts').select('*'),
      ])
      const cats = (categories ?? []) as Category[]
      const result = await parseBankStatement(content, cats.map(c => c.name))
      accountId = accountId ?? guessAccount((accounts ?? []) as Account[], result)?.id ?? null
      parsed = await buildStatementDraft(supabase, result, cats, rules ?? [], accountId)
    }

    const { error: upErr } = await supabase
      .from('fin_statements')
      .update({ status: 'parsed', parsed, account_id: accountId })
      .eq('id', id)
    if (upErr) throw new Error(upErr.message)
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okuma hatası'
    await supabaseRef?.from('fin_statements').update({ status: 'failed', error: message }).eq('id', id)
    return errorResponse(err)
  }
}
