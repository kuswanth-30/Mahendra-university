'use client'

import { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import OfflineProvider from '@/components/OfflineProvider'
import OfflineBanner from '@/components/OfflineBanner'
import { housekeeper } from '@/lib/services/housekeeper'
import { SessionProvider } from '@/components/SessionProvider'
import PanicButton from '@/components/PanicButton'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  useEffect(() => {
    // Start background housekeeping (auto-deletion)
    housekeeper.start();
    
    return () => {
      housekeeper.stop();
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-['Consolas','Courier_New',monospace] antialiased bg-slate-50 text-slate-900">
        <SessionProvider>
          <OfflineProvider>
            {children}
          </OfflineProvider>
          
          <PanicButton />
        </SessionProvider>
        
        {/* Global Offline Banner - appears on all pages */}
        <OfflineBanner />
        
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
