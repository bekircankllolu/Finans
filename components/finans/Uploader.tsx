'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { CheckCircle2, FileUp, Loader2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buttonClass, Field, inputClass } from './ui'

type Item = { name: string; state: 'uploading' | 'parsing' | 'done' | 'error'; id?: string; error?: string }

const ACCEPT = '.pdf,.csv,.txt,.xlsx,image/png,image/jpeg,image/webp'
const MAX_BYTES = 20 * 1024 * 1024

export function Uploader({ userId, accounts }: { userId: string; accounts: { id: string; name: string }[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'bank_statement' | 'loan_schedule'>('bank_statement')
  const [accountId, setAccountId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const busy = items.some(i => i.state === 'uploading' || i.state === 'parsing')

  const update = (idx: number, patch: Partial<Item>) => setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    const offset = items.length
    setItems(prev => [...prev, ...list.map(f => ({ name: f.name, state: 'uploading' as const }))])
    const supabase = createClient()

    // Sırayla: aynı anda çok sayıda AI çağrısı açmamak için
    for (const [i, file] of list.entries()) {
      const idx = offset + i
      try {
        if (file.size > MAX_BYTES) throw new Error('Dosya 20 MB’tan büyük')
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
        const path = `${userId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('fin-statements').upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw new Error(upErr.message)

        const res = await fetch('/api/finans/statements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: path, file_name: file.name, mime_type: file.type || 'application/octet-stream', kind, account_id: accountId || null }),
        })
        const created = await res.json()
        if (!res.ok) throw new Error(created.error)
        update(idx, { state: 'parsing', id: created.id })

        const parse = await fetch(`/api/finans/statements/${created.id}/parse`, { method: 'POST' })
        const parsed = await parse.json().catch(() => ({}))
        if (!parse.ok) throw new Error(parsed.error ?? 'Okuma başarısız')
        update(idx, { state: 'done' })
      } catch (err) {
        update(idx, { state: 'error', error: err instanceof Error ? err.message : 'Hata' })
      }
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Belge türü">
          <select className={inputClass} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option value="bank_statement">Kart / hesap ekstresi</option>
            <option value="loan_schedule">Kredi ödeme planı</option>
          </select>
        </Field>
        {kind === 'bank_statement' && (
          <Field label="Hesap" hint="Boş bırakırsan AI tanır; onayda değiştirebilirsin.">
            <select className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Otomatik tanı</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div
        onDragOver={e => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault()
          setDrag(false)
          if (!busy) void handleFiles(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-[#00D4FF] bg-[#00D4FF]/5' : 'border-white/10'}`}
      >
        <FileUp className="w-8 h-8 mx-auto text-[#8B8B9E]" />
        <p className="text-sm mt-3">Dosyaları buraya sürükle</p>
        <p className="text-xs text-[#5A5A6E] mt-1">PDF, Excel (.xlsx), CSV veya ekran görüntüsü · en fazla 20 MB</p>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={`${buttonClass.primary} mt-4`}>
          Dosya seç
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/6 px-3 py-2.5 text-sm">
              {it.state === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-[#0ca30c] shrink-0" />
              ) : it.state === 'error' ? (
                <XCircle className="w-4 h-4 text-[#d03b3b] shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-[#00D4FF] shrink-0" />
              )}
              <span className="truncate flex-1">{it.name}</span>
              <span className="text-xs text-[#8B8B9E] shrink-0">
                {it.state === 'uploading' && 'Yükleniyor…'}
                {it.state === 'parsing' && 'AI okuyor… (1-2 dk)'}
                {it.state === 'error' && <span className="text-[#f08a8a]">{it.error}</span>}
                {it.state === 'done' && it.id && (
                  <Link href={`/finans/yukle/${it.id}`} className="text-[#00D4FF]">
                    İncele ve onayla →
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
