import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-crit-bg flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-crit" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Giriş başarısız</h1>
        <p className="text-muted text-sm mb-6">Bağlantının süresi dolmuş veya geçersiz olabilir. Tekrar dene.</p>
        <Link
          href="/auth/login"
          className="bg-accent text-accent-fg font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-all text-sm"
        >
          Girişe dön
        </Link>
      </div>
    </div>
  )
}
