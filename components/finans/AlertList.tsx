'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react'
import { dismissAlert } from '@/app/finans/actions'
import type { Alert } from '@/lib/finans/calc/alerts'

const ICONS = {
  danger: { icon: AlertOctagon, color: '#d03b3b', label: 'Kritik' },
  warning: { icon: AlertTriangle, color: '#fab219', label: 'Uyarı' },
  info: { icon: Info, color: '#3987e5', label: 'Bilgi' },
}

export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const [pending, start] = useTransition()
  const shown = limit ? alerts.slice(0, limit) : alerts
  if (!shown.length) return <p className="text-sm text-[#8B8B9E]">Şu an dikkat gerektiren bir şey yok.</p>

  return (
    <ul className="space-y-2">
      {shown.map(a => {
        const { icon: Icon, color, label } = ICONS[a.severity]
        return (
          <li key={a.key} className="flex gap-3 rounded-xl bg-white/[0.03] border border-white/6 p-3" style={{ opacity: pending ? 0.7 : 1 }}>
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
              <div className="text-xs text-[#8B8B9E] mt-0.5">{a.message}</div>
            </div>
            <button
              type="button"
              onClick={() => start(async () => void (await dismissAlert(a.key)))}
              className="text-[#5A5A6E] hover:text-[#F0F0F5] shrink-0 self-start p-1 -m-1"
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
