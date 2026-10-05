'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { buttonClass } from './ui'

export function GenerateReport({ month, label }: { month: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-crit">{error}</span>}
      <button
        type="button"
        disabled={busy}
        className={buttonClass.primary}
        onClick={async () => {
          setBusy(true)
          setError('')
          const res = await fetch('/api/finans/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month }),
          })
          const body = await res.json().catch(() => ({}))
          setBusy(false)
          if (!res.ok) setError(body.error ?? 'Rapor oluşturulamadı')
          else router.push(`/finans/raporlar?ay=${body.month}`)
          router.refresh()
        }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy ? 'Analiz ediliyor… (1-2 dk)' : label}
      </button>
    </div>
  )
}
