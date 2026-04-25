// Stub sync engine for frontend UI rendering

export type SyncState = 'IDLE' | 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR' | 'RECONNECTING';

export interface SyncStats {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  processingCount: number;
  peers?: number;
  lastSyncAttempt?: Date;
  lastSuccessfulSync?: Date;
  errors: string[];
}

export const syncEngine = {
  getStats(): SyncStats {
    return {
      state: 'IDLE',
      pendingCount: 0,
      failedCount: 0,
      processingCount: 0,
      errors: []
    };
  },
  subscribe(callback: (stats: SyncStats) => void) {
    return () => {};
  },
  async forceSync(): Promise<void> {
    // Stub
  },
  async retryFailedItem(outboxId: number): Promise<boolean> {
    return true;
  },
  async clearFailedItems(): Promise<number> {
    return 0;
  },
  async queueAction(actionType: string, payload: any, options?: any): Promise<boolean> {
    return true;
  }
};
