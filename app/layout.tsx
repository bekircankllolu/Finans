import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finans — Kişisel finans takibi',
  description: 'Ekstrelerini yükle; gelir, gider, borç, kredi ve taksitlerini tek panelde gör, AI tavsiyesi al.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0D0D14] text-[#F0F0F5]">{children}</body>
    </html>
  )
}
