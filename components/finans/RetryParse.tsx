'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { readSSE } from '@/lib/finans/sseClient'
import { buttonClass } from './ui'

// Okunmamış / başarısız / eski sürümle okunmuş belgeyi yeniden okutur; ilerlemeyi canlı gösterir
export function RetryParse({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    setLog([])
    try {
      let needsVerify = false
      await readSSE(await fetch(`/api/finans/statements/${id}/parse`, { method: 'POST' }), e => {
        if (e.type === 'progress') setLog(l => [...l, e.message])
        if (e.type === 'done') needsVerify = !!e.needsVerify
      })
      if (needsVerify) {
        await readSSE(await fetch(`/api/finans/statements/${id}/verify`, { method: 'POST' }), e => {
          if (e.type === 'progress') setLog(l => [...l, e.message])
        })
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okuma başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" disabled={busy} className={buttonClass.primary} onClick={run}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {busy ? 'AI okuyor…' : 'AI ile oku'}
      </button>
      {log.length > 0 && (
        <ol className="text-sm text-ink-2 space-y-1 text-left">
          {log.map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ol>
      )}
      {error && <span className="text-sm text-crit">{error}</span>}
    </div>
  )
}
