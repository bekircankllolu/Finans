'use client'

import Link from 'next/link'
import { useOptimistic, useTransition } from 'react'
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react'
import { dismissAlert } from '@/app/finans/actions'
import type { Alert } from '@/lib/finans/calc/alerts'

const ICONS = {
  danger: { icon: AlertOctagon, color: '#d03b3b', label: 'Kritik' },
  warning: { icon: AlertTriangle, color: '#fab219', label: 'Uyarı' },
  info: { icon: Info, color: '#3987e5', label: 'Bilgi' },
}

export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const [, start] = useTransition()
  // Kapatılan uyarı sunucu yanıtı beklenmeden listeden düşer
  const [visible, hide] = useOptimistic(alerts, (current, key: string) => current.filter(a => a.key !== key))
  const shown = limit ? visible.slice(0, limit) : visible
  if (!shown.length) return <p className="text-sm text-muted">Şu an dikkat gerektiren bir şey yok.</p>

  return (
    <ul className="space-y-2">
      {shown.map(a => {
        const { icon: Icon, color, label } = ICONS[a.severity]
        return (
          <li key={a.key} className="flex gap-3 rounded-xl bg-surface-2 border border-line p-3">
            <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} aria-label={label} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {a.href ? (
                  <Link href={a.href} className="hover:underline">
                    {a.title}
                  </Link>
                ) : (
                  a.title
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">{a.message}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  hide(a.key)
                  await dismissAlert(a.key)
                })
              }
              className="text-faint hover:text-ink shrink-0 self-start p-1 -m-1"
              aria-label="Uyarıyı kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
