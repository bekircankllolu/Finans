import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finans — Kişisel finans takibi',
  description: 'Ekstrelerini yükle; gelir, gider, borç, kredi ve taksitlerini tek panelde gör, AI tavsiyesi al.',
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Tema tercihi cookie'de; sunucuda okununca sayfa ilk boyamada doğru temayla gelir (yanıp sönme yok)
  const theme = (await cookies()).get('theme')?.value
  return (
    <html lang="tr" className="h-full antialiased" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}>
      <body className="min-h-full flex flex-col bg-bg text-ink">{children}</body>
    </html>
  )
}
