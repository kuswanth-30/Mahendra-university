/**
 * SyncEngine - Distributed Systems Architecture for 404 Found
 * Manages background synchronization with exponential backoff, conflict resolution, and mesh networking
 */

import { db, OutboxItem, Message } from '../db';

// SyncEngine Configuration
const SYNC_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second base for exponential backoff
  maxDelay: 30000, // Cap at 30 seconds
  syncInterval: 30000, // Periodic sync every 30s
  batchSize: 5, // Process max 5 items at once
};

// Sync States
export type SyncState = 'IDLE' | 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR' | 'RECONNECTING';

// Conflict resolution strategies
export type ConflictStrategy = 'LWW' | 'MERGE' | 'CLIENT_WINS' | 'SERVER_WINS';

// Sync Statistics
export interface SyncStats {
  state: SyncState;
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  peers: number;
  lastSyncAttempt: Date | null;
  lastSuccessfulSync: Date | null;
  retryAttempts: number;
  errors: string[];
}

interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

class SyncEngine {
  private static instance: SyncEngine;
  private stats: SyncStats;
  private listeners: Set<(stats: SyncStats) => void>;
  private syncIntervalId: NodeJS.Timeout | null;
  private isProcessing: boolean;
  private processingItems: Set<number>;

  private constructor() {
    this.stats = {
      state: 'IDLE',
      pendingCount: 0,
      processingCount: 0,
      failedCount: 0,
      peers: 0,
      lastSyncAttempt: null,
      lastSuccessfulSync: null,
      retryAttempts: 0,
      errors: [],
    };
    this.listeners = new Set();
    this.syncIntervalId = null;
    this.isProcessing = false;
    this.processingItems = new Set();

    this.init();
  }

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  // Initialize the sync engine
  private init(): void {
    console.log('404 FOUND: [INIT] SyncEngine initialized');
    
    // Setup network listeners
    this.setupNetworkListeners();
    
    // Start periodic sync
    this.startPeriodicSync();
    
    // Initial stats update
    this.updateStats();
  }

  // Setup online/offline listeners
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('404 FOUND: [NETWORK] Connection restored - triggering sync');
      this.setState('ONLINE');
      this.processOutbox();
    });

    window.addEventListener('offline', () => {
      console.log('404 FOUND: [NETWORK] Connection lost - entering offline mode');
      this.setState('OFFLINE');
    });

    // Check initial state
    if (!navigator.onLine) {
      this.setState('OFFLINE');
    } else {
      this.setState('ONLINE');
    }
  }

  // Start periodic background sync
  private startPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = setInterval(() => {
      if (navigator.onLine && !this.isProcessing) {
        console.log('404 FOUND: [SCHEDULED] Periodic sync triggered');
        this.processOutbox();
      }
    }, SYNC_CONFIG.syncInterval);
  }

  // Stop periodic sync
  stopPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('404 FOUND: [STOPPED] Periodic sync disabled');
    }
  }

  // Update internal state and notify listeners
  private setState(newState: SyncState): void {
    const oldState = this.stats.state;
    this.stats.state = newState;
    
    if (oldState !== newState) {
      console.log(`404 FOUND: [STATE_CHANGE] ${oldState} → ${newState}`);
      this.notifyListeners();
    }
  }

  // Notify all listeners of stats change
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener({ ...this.stats }));
  }

  // Subscribe to sync status changes
  subscribe(listener: (stats: SyncStats) => void): () => void {
    this.listeners.add(listener);
    // Immediate callback with current state
    listener({ ...this.stats });
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Get current stats
  getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Queue Action - Optimistic UI Pattern
   * Immediately adds action to outbox and returns 'queued' status
   */
  async queueAction(
    actionType: OutboxItem['actionType'],
    payload: any,
    options: {
      priority?: 'high' | 'normal' | 'low';
      maxRetries?: number;
    } = {}
  ): Promise<{ status: 'QUEUED'; outboxId: number; timestamp: Date }> {
    const { priority = 'normal', maxRetries = SYNC_CONFIG.maxRetries } = options;

    const outboxItem: OutboxItem = {
      actionType,
      payload,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries,
      status: 'PENDING',
      priority,
    };

    const outboxId = await db.outbox.add(outboxItem);

    console.log(`404 FOUND: [QUEUED] Action ${actionType} added to outbox (ID: ${outboxId})`);

    // Trigger sync if online
    if (navigator.onLine && !this.isProcessing) {
      this.processOutbox();
    }

    // Update stats
    await this.updateStats();

    return {
      status: 'QUEUED',
      outboxId,
      timestamp: outboxItem.timestamp,
    };
  }

  // Update internal stats from database
  private async updateStats(): Promise<void> {
    const [pending, failed, processing] = await Promise.all([
      db.outbox.where('status').equals('PENDING').count(),
      db.outbox.where('status').equals('FAILED').count(),
      db.outbox.where('status').equals('PROCESSING').count(),
    ]);

    this.stats.pendingCount = pending + processing;
    this.stats.failedCount = failed;
    this.stats.processingCount = this.processingItems.size;

    this.notifyListeners();
  }

  /**
   * Process Outbox - Main Sync Logic
   * Handles partial failures and continues processing remaining items
   */
  async processOutbox(): Promise<SyncResult> {
    if (this.isProcessing) {
      console.log('404 FOUND: [SKIP] Sync already in progress');
      return { success: true, processed: 0, failed: 0, errors: [] };
    }

    if (!navigator.onLine) {
      console.log('404 FOUND: [SKIP] Offline - cannot process outbox');
      this.setState('OFFLINE');
      return { success: false, processed: 0, failed: 0, errors: ['Offline'] };
    }

    this.isProcessing = true;
    this.setState('SYNCING');
    this.stats.lastSyncAttempt = new Date();

    console.log('404 FOUND: [SYNC_START] Processing outbox...');

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Get pending items (respecting batch size)
      const pendingItems = await db.outbox
        .where('status')
        .equals('PENDING')
        .limit(SYNC_CONFIG.batchSize)
        .sortBy('timestamp');

      // Also get failed items ready for retry
      const retryableItems = await db.outbox
        .where('status')
        .equals('FAILED')
        .and(item => item.retryCount < item.maxRetries)
        .limit(SYNC_CONFIG.batchSize - pendingItems.length)
        .sortBy('timestamp');

      const itemsToProcess = [...pendingItems, ...retryableItems];

      if (itemsToProcess.length === 0) {
        console.log('404 FOUND: [SYNC_COMPLETE] Outbox empty');
        this.stats.lastSuccessfulSync = new Date();
        this.setState('ONLINE');
        this.isProcessing = false;
        await this.updateStats();
        return result;
      }

      console.log(`404 FOUND: [SYNC_PROCESSING] ${itemsToProcess.length} items to process`);

      // Process each item with individual error handling (partial failure support)
      for (const item of itemsToProcess) {
        if (!item.id) continue;

        try {
          await this.processItem(item);
          result.processed++;
          console.log(`404 FOUND: [SYNC_SUCCESS] Item ${item.id} (${item.actionType}) processed`);
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Item ${item.id}: ${errorMsg}`);
          console.error(`404 FOUND: [SYNC_FAILED] Item ${item.id} failed: ${errorMsg}`);
          
          // Continue processing other items despite failure
          continue;
        }
      }

      // Check if all items processed successfully
      const remainingPending = await db.outbox.where('status').equals('PENDING').count();
      const remainingFailed = await db.outbox.where('status').equals('FAILED').count();

      if (result.failed === 0) {
        console.log('404 FOUND: [SYNC_COMPLETE] All items processed successfully');
        this.stats.lastSuccessfulSync = new Date();
        this.setState('ONLINE');
      } else if (result.processed > 0) {
        console.log(`404 FOUND: [SYNC_PARTIAL] ${result.processed} succeeded, ${result.failed} failed`);
        this.setState('ERROR');
      } else {
        console.log('404 FOUND: [SYNC_FAILED] All items failed');
        this.setState('ERROR');
      }

      this.stats.errors = result.errors;

    } catch (error) {
      console.error('404 FOUND: [SYNC_ERROR] Fatal error during sync:', error);
      this.setState('ERROR');
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Fatal sync error');
    } finally {
      this.isProcessing = false;
      await this.updateStats();
    }

    return result;
  }

  // Process individual outbox item
  private async processItem(item: OutboxItem): Promise<void> {
    if (!item.id) throw new Error('Item has no ID');

    // Mark as processing
    await db.outbox.update(item.id, { status: 'PROCESSING' });
    this.processingItems.add(item.id);

    try {
      // Execute the action
      const result = await this.executeAction(item.actionType, item.payload);

      // Success - remove from outbox
      await db.outbox.delete(item.id);
      this.processingItems.delete(item.id);

      // Log success
      console.log(`404 FOUND: [ACTION_SUCCESS] ${item.actionType} completed`);

    } catch (error) {
      this.processingItems.delete(item.id);
      await this.handleProcessingError(item, error);
      throw error; // Re-throw to indicate failure
    }
  }

  // Execute action based on type
  private async executeAction(actionType: OutboxItem['actionType'], payload: any): Promise<any> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate random failures (10% chance) for testing
    if (Math.random() < 0.1) {
      throw new Error('Simulated network failure');
    }

    switch (actionType) {
      case 'POST_MESSAGE':
        return this.postMessage(payload);
      case 'BROADCAST_ALERT':
        return this.broadcastAlert(payload);
      case 'SCAN_QR':
        return this.processQRScan(payload);
      case 'UPDATE_STATUS':
        return this.updateStatus(payload);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  // Action implementations
  private async postMessage(payload: any): Promise<any> {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async broadcastAlert(payload: any): Promise<any> {
    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async processQRScan(payload: any): Promise<any> {
    // Save locally first
    await db.messages.add({
      type: 'qr',
      title: `QR: ${payload.data?.substring(0, 30) || 'Unknown'}...`,
      description: payload.location || 'Unknown location',
      timestamp: new Date(),
      synced: true,
      localId: `qr-${Date.now()}`,
    });

    // Attempt server sync
    try {
      await fetch('/api/qr/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Non-critical - already saved locally
      console.log('404 FOUND: [QR_SYNC_DEFERRED] Server sync failed, data saved locally');
    }

    return { scanned: true };
  }

  private async updateStatus(payload: any): Promise<any> {
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fire-and-forget, ignore errors
    });

    return { updated: true };
  }

  // Handle processing errors with exponential backoff
  private async handleProcessingError(item: OutboxItem, error: any): Promise<void> {
    if (!item.id) return;

    const newRetryCount = (item.retryCount || 0) + 1;
    const maxRetries = item.maxRetries || SYNC_CONFIG.maxRetries;

    // Calculate exponential backoff delay
    const delay = this.calculateBackoffDelay(newRetryCount);

    console.log(`404 FOUND: [BACKOFF] Retry ${newRetryCount}/${maxRetries} scheduled in ${delay}ms`);

    if (newRetryCount >= maxRetries) {
      // Max retries exceeded - mark as permanently failed
      await db.outbox.update(item.id, {
        retryCount: newRetryCount,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Max retries exceeded',
      });

      // Log to sync_errors table
      await db.syncErrors.add({
        outboxId: item.id,
        actionType: item.actionType,
        error: error instanceof Error ? error.message : 'Max retries exceeded',
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
        resolved: false,
      } as any);

      console.log(`404 FOUND: [MAX_RETRIES] Item ${item.id} permanently failed`);
    } else {
      // Schedule retry
      await db.outbox.update(item.id, {
        retryCount: newRetryCount,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Failed, will retry',
      });

      // Schedule retry after delay
      setTimeout(() => {
        if (navigator.onLine) {
          console.log(`404 FOUND: [RETRY] Attempting retry for item ${item.id}`);
          db.outbox.update(item.id!, { status: 'PENDING' }).then(() => {
            this.processOutbox();
          });
        }
      }, delay);
    }
  }

  /**
   * Exponential Backoff Calculation
   * 1s, 2s, 4s, 8s, 16s, 30s (capped)
   */
  private calculateBackoffDelay(retryCount: number): number {
    const delay = Math.min(
      SYNC_CONFIG.baseDelay * Math.pow(2, retryCount - 1),
      SYNC_CONFIG.maxDelay
    );
    return delay;
  }

  /**
   * Conflict Resolution - Last-Write-Wins Strategy
   */
  async resolveConflict(localMsg: Message, serverMsg: any): Promise<Message> {
    console.log('404 FOUND: [CONFLICT] Resolving conflict between local and server versions');

    const localTime = new Date(localMsg.timestamp).getTime();
    const serverTime = new Date(serverMsg.timestamp).getTime();

    if (serverTime > localTime) {
      // Server is newer - update local
      console.log('404 FOUND: [CONFLICT_RESOLVED] Server version is newer, updating local');
      
      const updatedMsg: Message = {
        ...localMsg,
        title: serverMsg.title,
        description: serverMsg.description,
        timestamp: new Date(serverMsg.timestamp),
        synced: true,
      };

      if (localMsg.id) {
        await db.messages.update(localMsg.id, updatedMsg);
      }

      return updatedMsg;
    } else if (localTime > serverTime) {
      // Local is newer - flag for manual merge
      console.log('404 FOUND: [CONFLICT_FLAGGED] Local version is newer, flagging for merge');
      
      const flaggedMsg: Message = {
        ...localMsg,
        synced: false,
      };

      // Log conflict for manual resolution
      await db.syncErrors.add({
        outboxId: 0,
        actionType: 'CONFLICT',
        error: `Local message ${localMsg.id} conflicts with server version`,
        timestamp: new Date(),
        resolved: false,
      } as any);

      return flaggedMsg;
    } else {
      // Same timestamp - prefer server (deterministic)
      console.log('404 FOUND: [CONFLICT_RESOLVED] Equal timestamps, using server version');
      return {
        ...localMsg,
        title: serverMsg.title,
        description: serverMsg.description,
        synced: true,
      };
    }
  }

  // Manual retry for failed items
  async retryFailedItem(outboxId: number): Promise<boolean> {
    const item = await db.outbox.get(outboxId);
    
    if (!item || item.status !== 'FAILED') {
      console.log(`404 FOUND: [RETRY_SKIP] Item ${outboxId} not found or not failed`);
      return false;
    }

    await db.outbox.update(outboxId, {
      status: 'PENDING',
      retryCount: Math.max(0, (item.retryCount || 0) - 1),
      error: undefined,
    });

    console.log(`404 FOUND: [RETRY_SCHEDULED] Item ${outboxId} queued for retry`);
    this.processOutbox();
    return true;
  }

  // Force immediate sync
  async forceSync(): Promise<SyncResult> {
    console.log('404 FOUND: [FORCE_SYNC] Manual sync triggered');
    return this.processOutbox();
  }

  // Clear all failed items
  async clearFailedItems(): Promise<number> {
    const failedItems = await db.outbox.where('status').equals('FAILED').toArray();
    
    for (const item of failedItems) {
      if (item.id) {
        await db.syncErrors.add({
          outboxId: item.id,
          actionType: item.actionType,
          error: 'Cleared by user',
          timestamp: new Date(),
          resolved: false,
        } as any);
      }
    }

    await db.outbox.bulkDelete(failedItems.map(item => item.id!));
    await this.updateStats();

    console.log(`404 FOUND: [CLEAR_FAILED] ${failedItems.length} failed items cleared`);
    return failedItems.length;
  }
}

// Export singleton
export const syncEngine = SyncEngine.getInstance();
export default syncEngine;
