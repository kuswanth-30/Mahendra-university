/**
 * useOfflineStatus - React Hook for Tracking Network Connectivity
 * Monitors navigator.onLine and provides offline/online state
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface OfflineStatus {
  isOffline: boolean;
  isOnline: boolean;
  wasOffline: boolean;
  lastChanged: Date | null;
}

export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>({
    isOffline: !navigator.onLine,
    isOnline: navigator.onLine,
    wasOffline: false,
    lastChanged: null,
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({
        isOffline: false,
        isOnline: true,
        wasOffline: prev.isOffline, // Remember we were offline
        lastChanged: new Date(),
      }));
      console.log('404 FOUND: [NETWORK] Connection restored');
    };

    const handleOffline = () => {
      setStatus(prev => ({
        isOffline: true,
        isOnline: false,
        wasOffline: prev.isOffline,
        lastChanged: new Date(),
      }));
      console.log('404 FOUND: [NETWORK] Connection lost - entering offline mode');
    };

    // Listen for network changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setStatus({
      isOffline: !navigator.onLine,
      isOnline: navigator.onLine,
      wasOffline: false,
      lastChanged: new Date(),
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}

// Hook that returns just the offline boolean
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

export default useOfflineStatus;
