import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cowork26',
  description: '실시간 협업 문서 정리 도구',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
