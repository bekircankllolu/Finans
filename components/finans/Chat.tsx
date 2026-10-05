'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowUp, Loader2, Trash2 } from 'lucide-react'
import { clearChat } from '@/app/finans/actions'
import { Markdown } from './Markdown'
import { buttonClass } from './ui'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Bu ay neden fazla harcadım?',
  'Hangi borcumu önce kapatmalıyım?',
  '1,2 milyonluk bir araba alırsam 36 ay kredi ile ne olur?',
  'Kullanmadığım abonelikler var mı?',
  'Acil durum fonu için ayda ne kadar ayırmalıyım?',
  'Kredimi erken kapatmak mantıklı mı?',
]

const TOOL_LABELS: Record<string, string> = {
  query_transactions: 'İşlemler taranıyor',
  get_category_trend: 'Kategori trendi hesaplanıyor',
  simulate_purchase: 'Alım simüle ediliyor',
  simulate_debt_payoff: 'Borç planı hesaplanıyor',
}

export function Chat({ initial }: { initial: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initial)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [pending, start] = useTransition()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setStatus('Düşünüyor…')
    setMessages(prev => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '' }])

    const append = (chunk: string) =>
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + chunk }
        return next
      })

    try {
      const res = await fetch('/api/finans/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Yanıt alınamadı')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const ev of events) {
          const line = ev.replace(/^data: /, '')
          if (!line) continue
          const data = JSON.parse(line)
          if (data.type === 'text') {
            setStatus('')
            append(data.text)
          } else if (data.type === 'tool') setStatus(TOOL_LABELS[data.name] ?? 'Hesaplanıyor')
          else if (data.type === 'error') throw new Error(data.message)
        }
      }
    } catch (err) {
      append(`\n\n_Hata: ${err instanceof Error ? err.message : 'bilinmeyen'}_`)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] min-h-[420px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center pt-10">
            <p className="text-sm text-muted mb-4">Verilerine dayanarak soru sor. Örnekler:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => send(s)} className="text-xs rounded-full border border-line-strong px-3 py-1.5 text-ink-2 hover:bg-hover">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft border border-accent/20 px-4 py-2.5 text-sm whitespace-pre-wrap">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface border border-line px-4 py-3">
              {m.content ? <Markdown text={m.content} /> : <span className="text-sm text-faint">…</span>}
            </div>
          ),
        )}
        {status && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {status}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={e => {
          e.preventDefault()
          void send(input)
        }}
      >
        <button
          type="button"
          aria-label="Sohbeti temizle"
          title="Sohbeti temizle"
          disabled={busy || pending || messages.length === 0}
          className={`${buttonClass.ghost} px-2.5 py-2.5`}
          onClick={() => window.confirm('Sohbet geçmişi silinsin mi?') && start(async () => {
            await clearChat()
            setMessages([])
          })}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <textarea
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          placeholder="Finansal durumun hakkında bir şey sor…"
          className="flex-1 resize-none bg-surface border border-line-strong rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent max-h-40"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Gönder" className={`${buttonClass.primary} px-2.5 py-2.5`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </form>
      <p className="text-[11px] text-faint mt-2 text-center">AI danışman yüklediğin verilerle hesap yapar; yatırım tavsiyesi değildir.</p>
    </div>
  )
}
