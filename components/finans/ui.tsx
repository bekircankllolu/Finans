import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatTRY } from '@/lib/finans/format'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#8B8B9E] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('bg-[#16151F] border border-white/8 rounded-2xl p-5 min-w-0', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-sm font-medium text-[#C3C2CF]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
  delta,
  deltaGoodWhenUp = true,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: number | null
  deltaGoodWhenUp?: boolean
}) {
  const good = delta != null && (deltaGoodWhenUp ? delta >= 0 : delta <= 0)
  return (
    <div className="bg-[#16151F] border border-white/8 rounded-2xl p-4 min-w-0">
      <div className="text-xs text-[#8B8B9E]">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold mt-1 truncate">{value}</div>
      {(hint || delta != null) && (
        <div className="text-xs mt-1 flex items-center gap-1.5 text-[#8B8B9E]">
          {delta != null && Number.isFinite(delta) && (
            <span className={good ? 'text-[#0ca30c]' : 'text-[#ec835a]'}>
              {delta >= 0 ? '▲' : '▼'} {formatTRY(Math.abs(delta))}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  )
}

export function Progress({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'good' | 'warning' | 'critical'; label?: string }) {
  const colors = { accent: '#3987e5', good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' }
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="h-2 rounded-full bg-white/6 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[tone] }} />
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'accent' }) {
  const tones = {
    neutral: 'bg-white/6 text-[#C3C2CF]',
    good: 'bg-[#0ca30c]/15 text-[#5fd35f]',
    warning: 'bg-[#fab219]/15 text-[#fab219]',
    critical: 'bg-[#d03b3b]/15 text-[#f08a8a]',
    accent: 'bg-[#00D4FF]/10 text-[#00D4FF]',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>
}

export function Empty({ title, children, href, cta }: { title: string; children?: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="text-sm text-[#8B8B9E] mt-1 max-w-md mx-auto">{children}</div>}
      {href && cta && (
        <Link href={href} className="inline-flex mt-4 text-sm px-3 py-2 rounded-lg bg-[#00D4FF] text-[#0D0D14] font-medium hover:opacity-90">
          {cta}
        </Link>
      )}
    </div>
  )
}

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  return (
    <span className={cn('tabular-nums', className)}>
      {signed && value > 0 ? '+' : ''}
      {formatTRY(value)}
    </span>
  )
}

export const inputClass =
  'w-full bg-[#0D0D14] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F0F0F5] placeholder:text-[#5A5A6E] focus:outline-none focus:border-[#00D4FF] transition-colors'

export const buttonClass = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] text-[#0D0D14] font-medium text-sm px-3 py-2 hover:opacity-90 disabled:opacity-50 transition',
  ghost: 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 text-[#F0F0F5] text-sm px-3 py-2 hover:bg-white/5 disabled:opacity-50 transition',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#d03b3b]/40 text-[#f08a8a] text-sm px-3 py-2 hover:bg-[#d03b3b]/10 disabled:opacity-50 transition',
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-[#8B8B9E] font-medium mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[#5A5A6E] mt-1 block">{hint}</span>}
    </label>
  )
}
