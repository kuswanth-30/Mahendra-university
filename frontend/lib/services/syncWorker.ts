// Stub sync worker for frontend UI rendering

export interface SyncStatus {
  processingCount: number;
  lastAttempt?: Date;
}

export default {
  async getSyncStatus(): Promise<SyncStatus> {
    return { processingCount: 0 };
  },
  async forceSync(): Promise<boolean> {
    return true;
  },
  async retryItem(outboxId: number): Promise<boolean> {
    return true;
  },
  async clearFailedItems(): Promise<number> {
    return 0;
  },
  start() {
    // Stub
  },
  stop() {
    // Stub
  }
};
