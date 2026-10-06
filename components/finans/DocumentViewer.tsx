'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'

type FileInfo = { url: string; name: string; path: string }

// Onay ekranında orijinal belgeyi gösterir: AI'nın okuduğunu kaynağıyla yan yana karşılaştırmak için
export function DocumentViewer({ statementId, mimeType }: { statementId: string; mimeType: string }) {
  const [files, setFiles] = useState<FileInfo[] | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/finans/statements/${statementId}/file`)
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Belge açılamadı')
        if (!Array.isArray(body.files) || body.files.length === 0 || body.files.some((file: FileInfo) => !file.url)) {
          throw new Error('Orijinal dosya bulunamadı veya dosyaya erişilemiyor.')
        }
        if (alive) setFiles(body.files)
      })
      .catch(err => alive && setError(err instanceof Error ? err.message : 'Belge açılamadı'))
    return () => {
      alive = false
    }
  }, [statementId])

  if (error) return <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted p-6 text-center">Belge önizlemesi açılamadı: {error}</div>
  if (!files) {
    return (
      <div className="h-full min-h-[240px] flex items-center justify-center text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const current = files[page]
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(current.path) || (page === 0 && mimeType.startsWith('image/'))
  const isPdf = /\.pdf$/i.test(current.path) || (page === 0 && mimeType === 'application/pdf')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-line text-xs">
        <div className="flex gap-1 overflow-x-auto flex-1">
          {files.map((f, i) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setPage(i)}
              className={cn('px-2 py-1 rounded-md whitespace-nowrap', i === page ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink')}
            >
              {files.length > 1 ? `${i + 1}. sayfa` : 'Orijinal belge'}
            </button>
          ))}
        </div>
        {isImage && (
          <button type="button" onClick={() => setZoom(z => !z)} className="p-1.5 rounded-md text-muted hover:text-ink" aria-label={zoom ? 'Uzaklaştır' : 'Yakınlaştır'}>
            {zoom ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </button>
        )}
        <a href={current.url} target="_blank" rel="noreferrer" className="p-1.5 rounded-md text-muted hover:text-ink" aria-label="Yeni sekmede aç">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <div className="flex-1 overflow-auto bg-surface-2">
        {isPdf ? (
          <iframe src={current.url} title="Ekstre" className="w-full h-full min-h-[40vh] border-0" />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- imzalı, kısa ömürlü harici URL; next/image optimizasyonu gereksiz
          <img src={current.url} alt={current.name} className={cn('mx-auto', zoom ? 'max-w-none w-[180%]' : 'w-full')} />
        ) : (
          <div className="p-6 text-sm text-muted">
            Bu dosya türü burada önizlenemiyor.{' '}
            <a href={current.url} target="_blank" rel="noreferrer" className="text-accent underline">
              İndir
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
