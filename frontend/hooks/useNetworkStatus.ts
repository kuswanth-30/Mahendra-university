'use client';

import { useState, useEffect, useCallback } from 'react';

type NetworkStatus = 'syncing' | 'mesh-alert' | 'offline-cached';

interface NetworkState {
  status: NetworkStatus;
  lastSynced: Date | null;
  isOnline: boolean;
  peers: number;
}

export function useNetworkStatus(): NetworkState {
  const [status, setStatus] = useState<NetworkStatus>('syncing');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [peers, setPeers] = useState(3); // Simulated peer count

  const updateStatus = useCallback(() => {
    const online = navigator.onLine;
    setIsOnline(online);
    
    if (!online) {
      setStatus('offline-cached');
    } else if (peers === 0) {
      setStatus('mesh-alert');
    } else {
      setStatus('syncing');
    }
    
    if (online) {
      setLastSynced(new Date());
    }
  }, [peers]);

  useEffect(() => {
    updateStatus();

    const handleOnline = () => {
      setIsOnline(true);
      setStatus('syncing');
      setTimeout(() => {
        setStatus(peers === 0 ? 'mesh-alert' : 'syncing');
        setLastSynced(new Date());
      }, 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline-cached');
    };

    // Simulate peer count changes for demo
    const peerInterval = setInterval(() => {
      setPeers(prev => {
        const change = Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        const newPeers = Math.max(0, Math.min(5, prev + change));
        return newPeers;
      });
    }, 8000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic sync simulation
    const syncInterval = setInterval(() => {
      if (navigator.onLine && peers > 0) {
        setLastSynced(new Date());
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
      clearInterval(peerInterval);
    };
  }, [updateStatus, peers]);

  // Update status when peers change
  useEffect(() => {
    if (isOnline) {
      setStatus(peers === 0 ? 'mesh-alert' : 'syncing');
    }
  }, [peers, isOnline]);

  return { status, lastSynced, isOnline, peers };
}

export function formatLastSync(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1m ago';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1h ago';
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleDateString();
}
