import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = ['Yükle', 'AI analizi', 'Kontrol et', 'Tamamlandı']

export function Stepper({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm mb-6 overflow-x-auto" aria-label="Ekstre yükleme adımları">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3 shrink-0" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold border',
                done && 'bg-accent border-accent text-accent-fg',
                active && 'border-accent text-accent bg-accent-soft',
                !done && !active && 'border-line-strong text-faint',
              )}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
            {/* Dar ekranda sadece etkin adımın adı görünür */}
            <span className={cn(active ? 'text-ink font-medium' : done ? 'text-ink-2 hidden sm:inline' : 'text-faint hidden sm:inline')}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-4 sm:w-10 h-px bg-line-strong" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
