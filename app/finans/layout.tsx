import Link from 'next/link'
import { FinansNav } from '@/components/finans/Nav'
import { FinanceAuthError } from '@/lib/finans/server'
import { getFinanceContext } from '@/lib/finans/load'

export default async function FinansLayout({ children }: { children: React.ReactNode }) {
  try {
    await getFinanceContext()
  } catch (err) {
    if (err instanceof FinanceAuthError && err.status === 403) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 text-center">
          <div>
            <h1 className="text-xl font-semibold">Erişim yok</h1>
            <p className="text-sm text-[#8B8B9E] mt-2">Bu hesap finans modülüne yetkili değil.</p>
            <Link href="/auth/login" className="text-sm text-[#00D4FF] mt-4 inline-block">Başka hesapla giriş yap</Link>
          </div>
        </div>
      )
    }
    throw err
  }

  return (
    <div className="flex min-h-screen w-full">
      <FinansNav />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-[1400px] mx-auto w-full">{children}</main>
    </div>
  )
}
