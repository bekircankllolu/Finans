'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, FileUp, LayoutDashboard, List, MessageSquare, PiggyBank, Settings, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle, type Theme } from './ThemeToggle'

const ITEMS = [
  { href: '/finans', label: 'Özet', icon: LayoutDashboard, match: ['/finans'] },
  { href: '/finans/yukle', label: 'Ekstreler', icon: FileUp, match: ['/finans/yukle'] },
  { href: '/finans/islemler', label: 'İşlemler', icon: List, match: ['/finans/islemler'] },
  { href: '/finans/borclar', label: 'Borçlar', icon: CreditCard, match: ['/finans/borclar'] },
  { href: '/finans/butce', label: 'Bütçe & Hedef', icon: PiggyBank, match: ['/finans/butce'] },
  { href: '/finans/sohbet', label: 'Danışman', icon: MessageSquare, match: ['/finans/sohbet', '/finans/raporlar'] },
  { href: '/finans/ayarlar', label: 'Ayarlar', icon: Settings, match: ['/finans/ayarlar'] },
]

// Tıklanan menü öğesinde sayfa gelene kadar sabit boyutlu bir nokta yanıp söner (layout kaymaz)
function PendingDot() {
  const { pending } = useLinkStatus()
  return (
    <span aria-hidden className={cn('ml-auto w-1.5 h-1.5 rounded-full bg-accent transition-opacity', pending ? 'opacity-100 animate-pulse' : 'opacity-0')} />
  )
}

export function FinansNav({ theme }: { theme: Theme }) {
  const pathname = usePathname()
  const isActive = (match: string[]) => match.some(m => (m === '/finans' ? pathname === m : pathname.startsWith(m)))

  return (
    <>
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-line bg-surface h-screen sticky top-0 px-4 py-7">
        <Link href="/finans" className="flex items-center gap-2.5 px-2.5 mb-7">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center">
            <Wallet className="w-4 h-4 text-accent-fg" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">Finans</span>
        </Link>
        <nav className="flex flex-col gap-1.5">
          {ITEMS.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(match) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive(match) ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-ink hover:bg-hover',
              )}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
              <PendingDot />
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-line">
          <ThemeToggle initial={theme} withLabel className="w-full px-3" />
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-surface/95 backdrop-blur border-b border-line">
        <Link href="/finans" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <Wallet className="w-4 h-4 text-accent-fg" />
          </div>
          <span className="font-semibold">Finans</span>
        </Link>
        <ThemeToggle initial={theme} />
      </header>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-7">
          {ITEMS.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(match) ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-0.5 py-2 text-[10px] leading-tight', isActive(match) ? 'text-accent' : 'text-muted')}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-full px-0.5">{label.split(' ')[0]}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
