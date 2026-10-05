'use client'

import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Theme = 'system' | 'light' | 'dark'
const ORDER: Theme[] = ['system', 'light', 'dark']
const LABEL: Record<Theme, string> = { system: 'Sistem teması', light: 'Açık tema', dark: 'Koyu tema' }

// Başlangıç teması sunucudan (cookie) gelir; böylece ilk render'da doğru ikon görünür
export function ThemeToggle({ initial, className, withLabel }: { initial: Theme; className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initial)

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(next)
    const root = document.documentElement
    if (next === 'system') {
      delete root.dataset.theme
      document.cookie = 'theme=; path=/; max-age=0; samesite=lax'
    } else {
      root.dataset.theme = next
      document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`
    }
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${LABEL[theme]} (değiştirmek için tıkla)`}
      aria-label={`Tema: ${LABEL[theme]}`}
      className={cn('inline-flex items-center gap-2 rounded-lg p-2 text-muted hover:text-ink hover:bg-hover transition-colors', className)}
    >
      <Icon className="w-4 h-4" />
      {withLabel && <span className="text-sm">{LABEL[theme]}</span>}
    </button>
  )
}
