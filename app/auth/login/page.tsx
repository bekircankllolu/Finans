'use client'

import { useState } from 'react'
import { ArrowRight, Loader2, Mail, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Korumalı sayfadan gelindiyse girişten sonra oraya dön
function nextParam(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : ''
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback${nextParam()}` },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D0D14] px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[#00D4FF] flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#0D0D14]" />
          </div>
          <span className="text-xl font-bold text-[#F0F0F5]">Finans</span>
        </div>

        <div className="bg-[#16151F] border border-white/8 rounded-2xl p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#00D4FF]/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-7 h-7 text-[#00D4FF]" />
              </div>
              <h2 className="text-xl font-semibold mb-2">E-postanı kontrol et</h2>
              <p className="text-[#8B8B9E] text-sm">
                <span className="text-[#F0F0F5]">{email}</span> adresine giriş bağlantısı gönderdik.
              </p>
              <p className="text-[#5A5A6E] text-xs mt-3">Bağlantıya tıklayınca giriş yapılır, şifre gerekmez.</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Giriş yap</h1>
              <p className="text-[#8B8B9E] text-sm mb-8">Şifre yok; e-postana tek kullanımlık giriş bağlantısı gelir.</p>

              <form onSubmit={handleMagicLink} className="space-y-4">
                <label className="block">
                  <span className="text-xs text-[#8B8B9E] font-medium mb-1.5 block">E-posta</span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="sen@ornek.com"
                    className="w-full bg-[#0D0D14] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#F0F0F5] placeholder:text-[#5A5A6E] focus:outline-none focus:border-[#00D4FF] transition-colors"
                    required
                  />
                </label>

                {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-[#00D4FF] text-[#0D0D14] font-semibold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#00D4FF]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Giriş bağlantısı gönder
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
