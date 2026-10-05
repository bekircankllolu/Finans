import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D0D14] px-4">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Giriş başarısız</h1>
        <p className="text-[#8B8B9E] text-sm mb-6">Bağlantının süresi dolmuş veya geçersiz olabilir. Tekrar dene.</p>
        <Link
          href="/auth/login"
          className="bg-[#00D4FF] text-[#0D0D14] font-semibold px-6 py-2.5 rounded-lg hover:bg-[#00D4FF]/90 transition-all text-sm"
        >
          Girişe dön
        </Link>
      </div>
    </div>
  )
}
