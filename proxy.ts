import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Sadece oturum gereken yollar; giriş sayfaları ve statik dosyalar proxy'den geçmez
  matcher: ['/finans/:path*', '/api/finans/:path*'],
}
