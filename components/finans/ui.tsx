import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatTRY } from '@/lib/finans/format'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between mb-7 lg:mb-9">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}

// Sayfa bölümü: başlık + açıklama + sağda bağlantı. Özet ekranı bunlarla düzenlenir.
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-8 lg:mb-10', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Card({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div className={cn('bg-surface border border-line rounded-2xl shadow-card min-w-0', padded && 'p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className={cn('flex flex-wrap items-center justify-between gap-3', padded ? 'mb-5' : 'px-5 sm:px-6 pt-5 sm:pt-6 pb-4')}>
          {title && <h3 className="text-base font-semibold text-ink-2 min-w-0 break-words">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  delta,
  deltaGoodWhenUp = true,
  deltaLabel = 'geçen döneme göre',
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: number | null
  deltaGoodWhenUp?: boolean
  deltaLabel?: string
  tone?: 'good' | 'crit'
}) {
  const showDelta = delta != null && Number.isFinite(delta) && Math.abs(delta) >= 1
  const good = showDelta && (deltaGoodWhenUp ? delta! >= 0 : delta! <= 0)
  return (
    <div className="bg-surface border border-line rounded-2xl shadow-card p-5 min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('text-xl sm:text-[22px] font-semibold mt-2 break-words tabular-nums tracking-tight', tone === 'good' && 'text-good', tone === 'crit' && 'text-crit')}>
        {value}
      </div>
      <div className="text-xs mt-2 text-muted min-h-[32px] leading-relaxed">
        {showDelta && (
          <span className={good ? 'text-good' : 'text-serious'}>
            {delta! >= 0 ? '▲' : '▼'} {formatTRY(Math.abs(delta!))}{' '}
          </span>
        )}
        {showDelta ? deltaLabel : hint}
      </div>
    </div>
  )
}

export function Progress({
  value,
  tone = 'accent',
  label,
  size = 'md',
}: {
  value: number
  tone?: 'accent' | 'good' | 'warning' | 'critical'
  label?: string
  size?: 'sm' | 'md'
}) {
  // Durum renkleri temadan bağımsız sabittir (palet kuralı); vurgu çubuğu seri-1 rengini kullanır
  const colors = { accent: 'var(--series-1)', good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' }
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className={cn('rounded-full bg-surface-2 overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2')}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[tone] }} />
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'accent'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2',
    good: 'bg-good-bg text-good',
    warning: 'bg-warn-bg text-warn',
    critical: 'bg-crit-bg text-crit',
    accent: 'bg-accent-soft text-accent',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>
}

export function Empty({ title, children, href, cta }: { title: string; children?: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="text-sm text-muted mt-1 max-w-md mx-auto">{children}</div>}
      {href && cta && (
        <Link href={href} className={cn(buttonClass.primary, 'mt-4')}>
          {cta}
        </Link>
      )}
    </div>
  )
}

export function Money({ value, className, signed, precise }: { value: number; className?: string; signed?: boolean; precise?: boolean }) {
  return (
    <span className={cn('tabular-nums', className)}>
      {signed && value > 0 ? '+' : ''}
      {formatTRY(value, precise)}
    </span>
  )
}

export const inputClass =
  'w-full min-w-0 bg-surface border border-line-strong rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition'

export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-fg font-medium text-sm px-3.5 py-2 hover:opacity-90 disabled:opacity-50 transition',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-ink text-sm px-3.5 py-2 hover:bg-hover disabled:opacity-50 transition',
  subtle: 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm px-2.5 py-1.5 text-muted hover:text-ink hover:bg-hover transition',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-crit/40 text-crit text-sm px-3.5 py-2 hover:bg-crit-bg disabled:opacity-50 transition',
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-muted font-medium mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint mt-1 block">{hint}</span>}
    </label>
  )
}

// Banka adı için küçük renkli olmayan monogram (marka logosu kullanmadan tanınabilirlik)
export function BankMark({ name, className }: { name: string | null; className?: string }) {
  const initials = (name ?? '?')
    .replace(/BBVA|Bankası|Bank/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toLocaleUpperCase('tr-TR')
  return (
    <span className={cn('inline-flex items-center justify-center w-9 h-9 rounded-xl bg-surface-2 border border-line text-xs font-semibold text-ink-2 shrink-0', className)} aria-hidden>
      {initials || '?'}
    </span>
  )
}
