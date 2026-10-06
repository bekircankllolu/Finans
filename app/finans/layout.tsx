import Link from 'next/link'
import { cookies } from 'next/headers'
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
            <p className="text-sm text-muted mt-2">Bu hesap finans modülüne yetkili değil.</p>
            <Link href="/auth/login" className="text-sm text-accent mt-4 inline-block">Başka hesapla giriş yap</Link>
          </div>
        </div>
      )
    }
    throw err
  }

  const cookie = (await cookies()).get('theme')?.value
  const theme = cookie === 'light' || cookie === 'dark' ? cookie : 'system'

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <FinansNav theme={theme} />
      <main className="finance-content flex-1 min-w-0 px-4 sm:px-7 lg:px-8 xl:px-10 py-7 lg:py-10 pb-28 lg:pb-14 max-w-[1600px] mx-auto w-full">{children}</main>
    </div>
  )
}
