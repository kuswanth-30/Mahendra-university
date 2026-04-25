'use client'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import OfflineProvider from '@/components/OfflineProvider'
import OfflineBanner from '@/components/OfflineBanner'
import { SessionProvider } from '@/components/SessionProvider'
import PanicButton from '@/components/PanicButton'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { MockDataProvider } from '@/contexts/MockDataContext'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-['Consolas','Courier_New',monospace] antialiased bg-black text-[#e5e7eb]">
        <MockDataProvider>
          <ThemeProvider>
            <SessionProvider>
              <OfflineProvider>
                {children}
              </OfflineProvider>
              
              <PanicButton />
            </SessionProvider>
            
            {/* Global Offline Banner - appears on all pages */}
            <OfflineBanner />
            
            {process.env.NODE_ENV === 'production' && <Analytics />}
          </ThemeProvider>
        </MockDataProvider>
      </body>
    </html>
  )
}
