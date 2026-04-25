'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { db, OutboxItem } from '@/lib/db';
import { actionManager, ActionResult } from '@/lib/services/actionManager';
import syncWorker from '@/lib/services/syncWorker';

export interface OfflineStatus {
  isOnline: boolean;
  isProcessing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAttempt?: Date;
  canRetry: boolean;
}

export function useOfflineFirst() {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: navigator.onLine,
    isProcessing: false,
    pendingCount: 0,
    failedCount: 0,
    canRetry: false
  });

  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    const [syncStatus, stats] = await Promise.all([
      syncWorker.getSyncStatus(),
      db.getOutboxStats()
    ]);

    setStatus({
      isOnline: navigator.onLine,
      isProcessing: syncStatus.processingCount > 0,
      pendingCount: stats.pending,
      failedCount: stats.failed,
      lastSyncAttempt: syncStatus.lastAttempt,
      canRetry: stats.failed > 0 && navigator.onLine
    });

    // Get detailed outbox items
    const items = await db.outbox
      .orderBy('timestamp')
      .reverse()
      .limit(20)
      .toArray();
    setOutboxItems(items);
  }, []);

  // Execute action with offline support
  const executeAction = useCallback(async (
    actionType: OutboxItem['actionType'],
    payload: any,
    options?: {
      priority?: 'high' | 'normal' | 'low';
      immediate?: boolean;
    }
  ): Promise<ActionResult> => {
    const result = await actionManager.executeAction(actionType, payload, options);
    
    // Refresh status after action
    setTimeout(refreshStatus, 100);
    
    return result;
  }, [refreshStatus]);

  // Force sync
  const forceSync = useCallback(async () => {
    const result = await syncWorker.forceSync();
    await refreshStatus();
    return result;
  }, [refreshStatus]);

  // Retry specific item
  const retryItem = useCallback(async (outboxId: number): Promise<boolean> => {
    const result = await syncWorker.retryItem(outboxId);
    if (result) {
      await refreshStatus();
    }
    return result;
  }, [refreshStatus]);

  // Clear failed items
  const clearFailed = useCallback(async (): Promise<number> => {
    const count = await syncWorker.clearFailedItems();
    await refreshStatus();
    return count;
  }, [refreshStatus]);

  // Setup periodic status refresh
  useEffect(() => {
    // Initial refresh
    refreshStatus();

    // Refresh every 5 seconds
    intervalRef.current = setInterval(refreshStatus, 5000);

    // Listen for online/offline events
    const handleOnline = () => {
      refreshStatus();
      // Trigger sync when coming online
      syncWorker.forceSync();
    };

    const handleOffline = () => {
      refreshStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for service worker messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'TRIGGER_SYNC') {
        syncWorker.forceSync();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [refreshStatus]);

  return {
    status,
    outboxItems,
    executeAction,
    forceSync,
    retryItem,
    clearFailed,
    refreshStatus
  };
}

// Hook for network status only (lighter weight)
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Hook for outbox count (for badges)
export function useOutboxCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const stats = await db.getOutboxStats();
      setCount(stats.total);
    };

    updateCount();

    // Update every 10 seconds
    const interval = setInterval(updateCount, 10000);

    return () => clearInterval(interval);
  }, []);

  return count;
}

export default useOfflineFirst;
