'use client'

import { AlertTriangle } from 'lucide-react'
import { buttonClass } from '@/components/finans/ui'

// Sunucu hatası: üretimde mesaj gizlendiği için en sık nedeni (eksik veritabanı migration'ı) de belirtilir
export default function FinansError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-12 h-12 rounded-full bg-crit-bg flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6 text-crit" />
      </div>
      <h1 className="text-lg font-semibold mt-4">Sayfa yüklenemedi</h1>
      <p className="text-sm text-muted mt-2">
        {error.message && !error.message.includes('Server Components') ? error.message : 'Beklenmeyen bir hata oluştu.'}
      </p>
      <p className="text-xs text-faint mt-3">
        Yeni bir sürüm yüklendiyse Supabase SQL editor’de <code>supabase/finans_v3.sql</code> dosyasını çalıştırdığından emin ol.
        {error.digest && <span className="block mt-1">Hata kodu: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className={`${buttonClass.primary} mt-6`}>
        Tekrar dene
      </button>
    </div>
  )
}
