'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CreditCard, FileUp, LayoutDashboard, List, MessageSquare, PiggyBank, Settings, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/finans', label: 'Özet', icon: LayoutDashboard },
  { href: '/finans/yukle', label: 'Ekstre', icon: FileUp },
  { href: '/finans/islemler', label: 'İşlemler', icon: List },
  { href: '/finans/borclar', label: 'Borçlar', icon: CreditCard },
  { href: '/finans/butce', label: 'Bütçe', icon: PiggyBank },
  { href: '/finans/raporlar', label: 'Raporlar', icon: BarChart3 },
  { href: '/finans/sohbet', label: 'Danışman', icon: MessageSquare },
  { href: '/finans/ayarlar', label: 'Ayarlar', icon: Settings },
]

// Tıklanan menü öğesinde, sayfa gelene kadar sabit boyutlu bir nokta yanıp söner (layout kaymaz)
function PendingDot() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={cn('ml-auto w-1.5 h-1.5 rounded-full bg-[#00D4FF] transition-opacity', pending ? 'opacity-100 animate-pulse' : 'opacity-0')}
    />
  )
}

export function FinansNav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/finans' ? pathname === href : pathname.startsWith(href))

  return (
    <>
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-white/8 min-h-screen sticky top-0 px-3 py-5">
        <Link href="/finans" className="flex items-center gap-2 px-2 mb-6">
          <div className="w-7 h-7 rounded-lg bg-[#00D4FF] flex items-center justify-center">
            <Wallet className="w-4 h-4 text-[#0D0D14]" />
          </div>
          <span className="font-semibold">Finans</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isActive(href) ? 'bg-white/8 text-[#F0F0F5]' : 'text-[#8B8B9E] hover:text-[#F0F0F5] hover:bg-white/4',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              <PendingDot />
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0D0D14]/95 backdrop-blur border-t border-white/8 overflow-x-auto">
        <div className="flex min-w-max px-1">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] min-w-[64px]',
                isActive(href) ? 'text-[#00D4FF]' : 'text-[#8B8B9E]',
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
