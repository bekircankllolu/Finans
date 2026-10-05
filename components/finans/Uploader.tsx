'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, FileImage, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { readSSE } from '@/lib/finans/sseClient'
import { cn } from '@/lib/utils'
import { Stepper } from './Stepper'
import { buttonClass, Card, Field, inputClass } from './ui'

const ACCEPT = '.pdf,.csv,.txt,.xlsx,image/png,image/jpeg,image/webp'
const MAX_BYTES = 20 * 1024 * 1024

type Kind = 'auto' | 'loan_schedule'
type LogLine = { step: string; message: string; at: number }
type Job = {
  key: string
  name: string
  files: File[]
  state: 'waiting' | 'uploading' | 'analyzing' | 'ready' | 'error'
  id?: string
  log: LogLine[]
  error?: string
  startedAt?: number
}

function fileIcon(f: File) {
  if (f.type.startsWith('image/')) return FileImage
  if (/\.(xlsx|csv)$/i.test(f.name)) return FileSpreadsheet
  return FileText
}

export function Uploader({ userId, accounts }: { userId: string; accounts: { id: string; name: string }[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [kind, setKind] = useState<Kind>('auto')
  const [accountId, setAccountId] = useState('')
  const [grouped, setGrouped] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const running = jobs.some(j => j.state === 'uploading' || j.state === 'analyzing')
  const step: 0 | 1 = jobs.length ? 1 : 0

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list)
    const tooBig = next.find(f => f.size > MAX_BYTES)
    if (tooBig) {
      setError(`${tooBig.name} 20 MB’tan büyük`)
      return
    }
    setError('')
    const all = [...files, ...next]
    setFiles(all)
    // Birden çok ekran görüntüsü genelde aynı ekstrenin sayfalarıdır
    setGrouped(all.length > 1 && all.every(f => f.type.startsWith('image/')))
  }

  const update = (key: string, patch: Partial<Job> | ((j: Job) => Partial<Job>)) =>
    setJobs(prev => prev.map(j => (j.key === key ? { ...j, ...(typeof patch === 'function' ? patch(j) : patch) } : j)))

  async function start() {
    const groups = grouped ? [files] : files.map(f => [f])
    const created: Job[] = groups.map((g, i) => ({
      key: `${Date.now()}-${i}`,
      name: g.length > 1 ? `${g[0].name} + ${g.length - 1} sayfa` : g[0].name,
      files: g,
      state: 'waiting',
      log: [],
    }))
    setJobs(created)
    setFiles([])
    const supabase = createClient()
    const ids: string[] = []

    // Sırayla: aynı anda birden çok uzun AI okuması açmamak için
    for (const job of created) {
      const log = (step: string, message: string) => update(job.key, j => ({ log: [...j.log, { step, message, at: Date.now() }] }))
      try {
        update(job.key, { state: 'uploading', startedAt: Date.now() })
        log('upload', `${job.files.length} dosya yükleniyor`)
        const paths: string[] = []
        for (const f of job.files) {
          const ext = f.name.split('.').pop()?.toLowerCase() ?? 'bin'
          const path = `${userId}/${crypto.randomUUID()}.${ext}`
          const { error: upErr } = await supabase.storage.from('fin-statements').upload(path, f, { contentType: f.type || undefined })
          if (upErr) throw new Error(upErr.message)
          paths.push(path)
        }
        const res = await fetch('/api/finans/statements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: paths[0],
            extra_paths: paths.slice(1),
            file_name: job.files[0].name,
            mime_type: job.files[0].type || 'application/octet-stream',
            kind: kind === 'loan_schedule' ? 'loan_schedule' : 'bank_statement',
            account_id: accountId || null,
          }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error)
        update(job.key, { state: 'analyzing', id: body.id })

        let needsVerify = false
        await readSSE(await fetch(`/api/finans/statements/${body.id}/parse`, { method: 'POST' }), e => {
          if (e.type === 'progress') log(e.step, e.message)
          if (e.type === 'done') needsVerify = !!e.needsVerify
        })
        if (needsVerify) {
          await readSSE(await fetch(`/api/finans/statements/${body.id}/verify`, { method: 'POST' }), e => {
            if (e.type === 'progress') log(e.step, e.message)
          })
        }
        log('ready', 'Kontrole hazır')
        update(job.key, { state: 'ready' })
        ids.push(body.id)
      } catch (err) {
        update(job.key, { state: 'error', error: err instanceof Error ? err.message : 'Hata' })
      }
    }
    router.refresh()
    // Tek ekstre ise doğrudan kontrol adımına geç
    if (created.length === 1 && ids.length === 1) router.push(`/finans/yukle/${ids[0]}`)
  }

  return (
    <Card>
      <Stepper current={step} />

      {step === 0 && (
        <div className="space-y-5">
          <div
            onDragOver={e => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => {
              e.preventDefault()
              setDrag(false)
              addFiles(e.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            className={cn(
              'rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-colors',
              drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent hover:bg-hover',
            )}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-accent-soft flex items-center justify-center">
              <Upload className="w-5 h-5 text-accent" />
            </div>
            <p className="text-sm font-medium mt-4">Ekstreleri sürükle bırak veya seç</p>
            <p className="text-xs text-muted mt-1">PDF, Excel (.xlsx), CSV veya ekran görüntüsü · dosya başına en fazla 20 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {error && <p className="text-sm text-crit">{error}</p>}

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f, i) => {
                const Icon = fileIcon(f)
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                    <Icon className="w-4 h-4 text-muted shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-faint tabular-nums">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      type="button"
                      className="p-1 text-faint hover:text-crit"
                      aria-label={`${f.name} dosyasını çıkar`}
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Belge türü">
              <select className={inputClass} value={kind} onChange={e => setKind(e.target.value as Kind)}>
                <option value="auto">Otomatik tanı (kart / hesap ekstresi)</option>
                <option value="loan_schedule">Kredi ödeme planı</option>
              </select>
            </Field>
            {kind !== 'loan_schedule' && (
              <Field label="Hesap" hint="Boş bırakırsan banka ve son 4 haneden otomatik eşlenir.">
                <select className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}>
                  <option value="">Otomatik eşle</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {files.length > 1 && (
            <label className="flex items-start gap-2.5 text-sm rounded-xl bg-surface-2 px-3 py-2.5">
              <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={grouped} onChange={e => setGrouped(e.target.checked)} />
              <span>
                Bu dosyalar <strong>aynı ekstrenin sayfaları</strong>
                <span className="block text-xs text-muted">İşaretlersen tek ekstre olarak birlikte okunur (ör. aynı ekstrenin 3 ekran görüntüsü). İşaretlemezsen her dosya ayrı ekstredir.</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted max-w-md">
              AI her satırı okur, ekstredeki toplamlarla karşılaştırır; tutmazsa belgeyi ikinci kez kontrol eder. Sonra her şeyi sen onaylarsın.
            </p>
            <button type="button" disabled={!files.length} onClick={start} className={buttonClass.primary}>
              Analizi başlat
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {jobs.map(job => (
            <AnalysisCard key={job.key} job={job} />
          ))}
          {!running && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className={buttonClass.ghost} onClick={() => setJobs([])}>
                Yeni yükleme
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const sec = Math.max(0, Math.round((now - since) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
    </span>
  )
}

function AnalysisCard({ job }: { job: Job }) {
  const active = job.state === 'uploading' || job.state === 'analyzing'
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-center gap-3">
        {job.state === 'ready' ? (
          <span className="w-8 h-8 rounded-full bg-good-bg flex items-center justify-center">
            <Check className="w-4 h-4 text-good" />
          </span>
        ) : job.state === 'error' ? (
          <span className="w-8 h-8 rounded-full bg-crit-bg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-crit" />
          </span>
        ) : (
          <span className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{job.name}</div>
          <div className="text-xs text-muted">
            {job.state === 'waiting' && 'Sırada'}
            {job.state === 'uploading' && 'Yükleniyor'}
            {job.state === 'analyzing' && 'AI belgeyi okuyor ve kontrol ediyor · uzun ekstrelerde 1-3 dk sürebilir'}
            {job.state === 'ready' && 'Analiz tamamlandı'}
            {job.state === 'error' && <span className="text-crit">{job.error}</span>}
          </div>
        </div>
        {active && job.startedAt && (
          <span className="text-xs text-muted">
            <Elapsed since={job.startedAt} />
          </span>
        )}
        {job.state === 'ready' && job.id && (
          <Link href={`/finans/yukle/${job.id}`} className={buttonClass.primary}>
            Kontrol et
          </Link>
        )}
        {job.state === 'error' && job.id && (
          <Link href={`/finans/yukle/${job.id}`} className={buttonClass.ghost}>
            Detay
          </Link>
        )}
      </div>
      {job.log.length > 0 && (
        <ol className="mt-4 ml-4 border-l border-line pl-5 space-y-2">
          {job.log.map((l, i) => {
            const last = i === job.log.length - 1 && active
            return (
              <li key={i} className="relative text-sm animate-fade-in">
                <span
                  className={cn(
                    'absolute -left-[26px] top-1 w-2.5 h-2.5 rounded-full border-2 border-surface',
                    last ? 'bg-accent animate-pulse' : l.step === 'reconciled' && l.message.includes('fark') ? 'bg-[#fab219]' : 'bg-[#0ca30c]',
                  )}
                />
                <span className={last ? 'text-ink' : 'text-ink-2'}>{l.message}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
