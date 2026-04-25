import { db, OutboxItem, SyncError } from '../db';
import { actionManager } from './actionManager';

// Sync worker configuration
const SYNC_CONFIG = {
  interval: 30000,        // Check every 30 seconds
  retryDelay: 5000,       // Wait 5 seconds between retries
  maxConcurrent: 3,       // Process max 3 items at once
  offlineRetryDelay: 60000 // Retry every minute when offline
};

class SyncWorker {
  private static instance: SyncWorker;
  private isRunning: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private processingQueue: Set<number> = new Set();
  private lastSyncAttempt: Date | null = null;

  private constructor() {}

  static getInstance(): SyncWorker {
    if (!SyncWorker.instance) {
      SyncWorker.instance = new SyncWorker();
    }
    return SyncWorker.instance;
  }

  // Start background sync
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[SyncWorker] Started');

    // Immediate first check
    this.processOutbox();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.processOutbox();
    }, SYNC_CONFIG.interval);

    // Listen for online events
    window.addEventListener('online', () => {
      console.log('[SyncWorker] Network online - triggering sync');
      this.processOutbox();
    });

    // Listen for visibility changes (app comes to foreground)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[SyncWorker] App visible - checking outbox');
        this.processOutbox();
      }
    });
  }

  // Stop background sync
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log('[SyncWorker] Stopped');
  }

  // Process outbox items
  private async processOutbox(): Promise<void> {
    if (!navigator.onLine) {
      console.log('[SyncWorker] Offline - skipping sync');
      await db.logNetworkStatus('offline', 'Sync skipped - browser offline');
      return;
    }

    // Don't process if already at max concurrency
    if (this.processingQueue.size >= SYNC_CONFIG.maxConcurrent) {
      console.log('[SyncWorker] At max concurrency - deferring');
      return;
    }

    try {
      // Get pending items
      const pendingItems = await db.getPendingOutboxItems();
      
      // Also get failed items that are ready for retry
      const retryableItems = await db.getRetryableItems();
      
      const allItems = [...pendingItems, ...retryableItems]
        .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())
        .slice(0, SYNC_CONFIG.maxConcurrent);

      if (allItems.length === 0) {
        return; // Nothing to process
      }

      console.log(`[SyncWorker] Processing ${allItems.length} items`);
      this.lastSyncAttempt = new Date();

      // Process items in parallel (but limited by maxConcurrent)
      await Promise.all(
        allItems.map(item => this.processItem(item))
      );

      await db.logNetworkStatus('syncing', `Processed ${allItems.length} outbox items`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SyncWorker] Process error:', errorMsg);
      await db.logNetworkStatus('error', `Sync failed: ${errorMsg}`);
    }
  }

  // Process a single outbox item
  private async processItem(item: OutboxItem): Promise<void> {
    if (!item.id || this.processingQueue.has(item.id)) {
      return; // Already processing
    }

    this.processingQueue.add(item.id);

    try {
      // Mark as processing
      await db.outbox.update(item.id, {
        status: 'PROCESSING'
      });

      // Attempt to execute the action
      await actionManager.executeAction(
        item.actionType,
        item.payload,
        {
          priority: item.priority,
          maxRetries: 1, // Don't re-queue, we'll handle retry ourselves
          immediate: true
        }
      );

      // Success! Remove from outbox
      await db.outbox.delete(item.id);
      console.log(`[SyncWorker] Item ${item.id} processed successfully`);

    } catch (error) {
      await this.handleProcessingError(item, error);
    } finally {
      this.processingQueue.delete(item.id!);
    }
  }

  // Handle processing errors
  private async handleProcessingError(item: OutboxItem, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const newRetryCount = (item.retryCount || 0) + 1;
    const maxRetries = item.maxRetries || 5;

    console.error(`[SyncWorker] Item ${item.id} failed (attempt ${newRetryCount}/${maxRetries}):`, errorMessage);

    if (newRetryCount >= maxRetries) {
      // Max retries reached - log to sync_errors and remove from outbox
      await db.syncErrors.add({
        outboxId: item.id!,
        actionType: item.actionType,
        error: `Max retries exceeded: ${errorMessage}`,
        errorStack: error instanceof Error ? error.stack : undefined,
        resolved: false
      } as SyncError);

      await db.outbox.delete(item.id!);
      
      await db.logNetworkStatus('error', 
        `Item ${item.id} failed permanently after ${maxRetries} retries`
      );
    } else {
      // Update retry count and status
      await db.outbox.update(item.id!, {
        retryCount: newRetryCount,
        status: 'FAILED',
        error: errorMessage,
        timestamp: new Date() // Update timestamp for retry delay calculation
      });

      // Schedule retry
      setTimeout(() => {
        this.processOutbox();
      }, SYNC_CONFIG.retryDelay * newRetryCount); // Exponential backoff
    }
  }

  // Force immediate sync (can be called from UI)
  async forceSync(): Promise<{
    processed: number;
    failed: number;
    remaining: number;
  }> {
    const beforeStats = await db.getOutboxStats();
    
    await this.processOutbox();
    
    // Wait a bit for processing to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const afterStats = await db.getOutboxStats();

    return {
      processed: beforeStats.pending - afterStats.pending,
      failed: afterStats.failed - beforeStats.failed,
      remaining: afterStats.total
    };
  }

  // Get sync status for UI
  async getSyncStatus(): Promise<{
    isRunning: boolean;
    lastAttempt?: Date;
    processingCount: number;
    pendingCount: number;
    failedCount: number;
  }> {
    const stats = await db.getOutboxStats();
    
    return {
      isRunning: this.isRunning,
      lastAttempt: this.lastSyncAttempt || undefined,
      processingCount: this.processingQueue.size,
      pendingCount: stats.pending,
      failedCount: stats.failed
    };
  }

  // Retry a specific failed item
  async retryItem(outboxId: number): Promise<boolean> {
    const item = await db.outbox.get(outboxId);
    
    if (!item || item.status !== 'FAILED') {
      return false;
    }

    await db.outbox.update(outboxId, {
      status: 'PENDING',
      retryCount: Math.max(0, (item.retryCount || 0) - 1),
      error: undefined
    });

    // Trigger sync
    this.processOutbox();
    return true;
  }

  // Clear all failed items (user action)
  async clearFailedItems(): Promise<number> {
    const failed = await db.outbox
      .where('status')
      .equals('FAILED')
      .toArray();

    // Log them as errors first
    for (const item of failed) {
      await db.syncErrors.add({
        outboxId: item.id!,
        actionType: item.actionType,
        error: 'Cleared by user',
        resolved: false
      } as SyncError);
    }

    await db.outbox.bulkDelete(failed.map(f => f.id!));
    return failed.length;
  }
}

export const syncWorker = SyncWorker.getInstance();
export default syncWorker;
