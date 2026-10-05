'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { buttonClass } from './ui'

export function RetryParse({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={buttonClass.primary}
        onClick={async () => {
          setBusy(true)
          setError('')
          const res = await fetch(`/api/finans/statements/${id}/parse`, { method: 'POST' })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) setError(body.error ?? 'Okuma başarısız')
          setBusy(false)
          router.refresh()
        }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {busy ? 'AI okuyor…' : 'AI ile oku'}
      </button>
      {error && <span className="text-sm text-[#f08a8a]">{error}</span>}
    </div>
  )
}
