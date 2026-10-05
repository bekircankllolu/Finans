import Link from 'next/link'
import { cn } from '@/lib/utils'

// Danışman bölümü: sohbet + aylık raporlar tek menü altında
export function AdvisorTabs({ active }: { active: 'chat' | 'reports' }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={cn('px-3 py-1.5 rounded-lg text-sm transition', on ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-ink')}>
      {label}
    </Link>
  )
  return (
    <div className="flex rounded-xl border border-line bg-surface p-1 shadow-card">
      {tab('/finans/sohbet', 'Sohbet', active === 'chat')}
      {tab('/finans/raporlar', 'Aylık raporlar', active === 'reports')}
    </div>
  )
}
