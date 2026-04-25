'use client';

import { useEffect, useState } from 'react';
import syncWorker from '@/lib/services/syncWorker';

interface OfflineProviderProps {
  children: React.ReactNode;
}

export default function OfflineProvider({ children }: OfflineProviderProps) {
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    // Register service worker - ONLY IN PRODUCTION
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[OfflineProvider] SW registered:', registration.scope);
          setIsRegistered(true);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('[OfflineProvider] New version available');
                  // Could show update notification here
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[OfflineProvider] SW registration failed:', error);
        });
    }

    // Start sync worker
    syncWorker.start();

    return () => {
      syncWorker.stop();
    };
  }, []);

  return <>{children}</>;
}
