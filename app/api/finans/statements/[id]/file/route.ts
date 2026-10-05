import type { NextRequest } from 'next/server'
import { errorResponse, getFinanceUser } from '@/lib/finans/server'

// Onay ekranında orijinal belgeyi yan yana göstermek için kısa ömürlü imzalı URL'ler
export async function GET(_req: NextRequest, ctx: RouteContext<'/api/finans/statements/[id]/file'>) {
  const { id } = await ctx.params
  try {
    const { supabase } = await getFinanceUser()
    const { data: st } = await supabase.from('fin_statements').select('file_path, extra_paths, mime_type, file_name').eq('id', id).single()
    if (!st) return Response.json({ error: 'Ekstre bulunamadı' }, { status: 404 })
    const paths: string[] = [st.file_path, ...(st.extra_paths ?? [])]
    const { data, error } = await supabase.storage.from('fin-statements').createSignedUrls(paths, 60 * 30)
    if (error) throw new Error(error.message)
    return Response.json({
      files: (data ?? []).map((d, i) => ({ url: d.signedUrl, name: i === 0 ? st.file_name : `${i + 1}. sayfa`, path: paths[i] })),
      mimeType: st.mime_type,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
