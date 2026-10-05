import { z } from 'zod'
import { errorResponse, getFinanceUser } from '@/lib/finans/server'

const CreateInput = z.object({
  file_path: z.string().min(1).max(300),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().max(120),
  // Aynı ekstrenin ek sayfaları/ekran görüntüleri
  extra_paths: z.array(z.string().min(1).max(300)).max(20).default([]),
  kind: z.enum(['bank_statement', 'loan_schedule']),
  account_id: z.string().uuid().nullable().optional(),
})

// Dosya tarayıcıdan doğrudan Supabase Storage'a yüklenir; burada sadece kaydı açılır.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await getFinanceUser()
    const body = CreateInput.parse(await request.json())
    if (![body.file_path, ...body.extra_paths].every(p => p.startsWith(`${user.id}/`))) {
      return Response.json({ error: 'Geçersiz dosya yolu' }, { status: 400 })
    }
    const { data, error } = await supabase.from('fin_statements').insert(body).select('id').single()
    if (error) throw new Error(error.message)
    return Response.json({ id: data.id })
  } catch (err) {
    return errorResponse(err)
  }
}
