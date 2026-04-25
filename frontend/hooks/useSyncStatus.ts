/**
 * useSyncStatus - React Hook for SyncEngine Integration
 * Exposes current sync state for the 404 Found header status indicator
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { syncEngine, SyncState, SyncStats } from '@/lib/services/syncEngine';

interface UseSyncStatusReturn {
  // Current state
  state: SyncState;
  isOnline: boolean;
  isSyncing: boolean;
  isError: boolean;
  
  // Counts
  pendingCount: number;
  failedCount: number;
  processingCount: number;
  peers: number;
  
  // Timestamps
  lastSyncAttempt: Date | null;
  lastSuccessfulSync: Date | null;
  
  // Errors
  errors: string[];
  
  // Actions
  forceSync: () => Promise<void>;
  retryFailed: (outboxId: number) => Promise<boolean>;
  clearFailed: () => Promise<number>;
  refresh: () => void;
}

export function useSyncStatus(): UseSyncStatusReturn {
  // Initialize with current stats
  const [stats, setStats] = useState<SyncStats>(syncEngine.getStats());

  // Subscribe to sync engine updates
  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((newStats) => {
      setStats(newStats);
    });

    return unsubscribe;
  }, []);

  // Derived state helpers
  const isOnline = stats.state === 'ONLINE' || stats.state === 'SYNCING';
  const isSyncing = stats.state === 'SYNCING';
  const isError = stats.state === 'ERROR';

  // Action wrappers
  const forceSync = useCallback(async () => {
    console.log('404 FOUND: [HOOK] Force sync triggered from UI');
    await syncEngine.forceSync();
  }, []);

  const retryFailed = useCallback(async (outboxId: number) => {
    console.log(`404 FOUND: [HOOK] Retry requested for item ${outboxId}`);
    return syncEngine.retryFailedItem(outboxId);
  }, []);

  const clearFailed = useCallback(async () => {
    console.log('404 FOUND: [HOOK] Clear failed items requested');
    return syncEngine.clearFailedItems();
  }, []);

  const refresh = useCallback(() => {
    setStats(syncEngine.getStats());
  }, []);

  return {
    // State
    state: stats.state,
    isOnline,
    isSyncing,
    isError,
    
    // Counts
    pendingCount: stats.pendingCount,
    failedCount: stats.failedCount,
    processingCount: stats.processingCount,
    peers: stats.peers || 0,
    
    // Timestamps
    lastSyncAttempt: stats.lastSyncAttempt,
    lastSuccessfulSync: stats.lastSuccessfulSync,
    
    // Errors
    errors: stats.errors,
    
    // Actions
    forceSync,
    retryFailed,
    clearFailed,
    refresh,
  };
}

// Simplified hook for just the status indicator (Header use case)
export function useSimpleSyncStatus(): {
  state: SyncState;
  label: string;
  color: string;
  isOnline: boolean;
} {
  const [state, setState] = useState<SyncState>('IDLE');

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((stats) => {
      setState(stats.state);
    });

    return unsubscribe;
  }, []);

  // Map states to UI-friendly labels and colors
  const stateConfig: Record<SyncState, { label: string; color: string }> = {
    'IDLE': { label: 'Idle', color: '#6b6b7b' },
    'ONLINE': { label: 'Online', color: '#22c55e' },
    'OFFLINE': { label: 'Offline', color: '#a0a0b0' },
    'SYNCING': { label: 'Syncing...', color: '#9333ea' },
    'ERROR': { label: 'Sync Error', color: '#ef4444' },
    'RECONNECTING': { label: 'Reconnecting', color: '#f59e0b' },
  };

  const config = stateConfig[state];

  return {
    state,
    label: config.label,
    color: config.color,
    isOnline: state === 'ONLINE' || state === 'SYNCING',
  };
}

// Hook for optimistic action queuing
export function useSyncActions() {
  const queueAction = useCallback(async (
    actionType: 'POST_MESSAGE' | 'BROADCAST_ALERT' | 'SCAN_QR' | 'UPDATE_STATUS',
    payload: any,
    options?: { priority?: 'high' | 'normal' | 'low' }
  ) => {
    console.log(`404 FOUND: [HOOK] Queueing action ${actionType}`);
    return syncEngine.queueAction(actionType, payload, options);
  }, []);

  return {
    queueAction,
  };
}

export default useSyncStatus;
