/**
 * Housekeeper Service - Network Hygiene (Data Lifecycle Management)
 * 
 * Asynchronous service that runs on app startup and every 6 hours thereafter.
 * Deletes messages older than 72 hours (except is_pinned: true).
 * Uses requestIdleCallback for non-blocking pruning.
 */

import { db } from '@/lib/db';

class HousekeeperService {
  constructor() {
    this.worker = null;
    this.isStarted = false;
    this.intervalId = null;
    this.MESSAGE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
    this.CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  }

  /**
   * Start the housekeeper background service
   * Runs on app startup and every 6 hours thereafter
   */
  async start() {
    if (this.isStarted) return;

    try {
      console.log('[Housekeeper] Starting Network Hygiene service...');

      // Run initial cleanup on startup
      await this.pruneExpiredMessages();

      // Schedule periodic cleanup every 6 hours
      this.intervalId = setInterval(() => {
        this.schedulePruning();
      }, this.CLEANUP_INTERVAL_MS);

      this.isStarted = true;
      console.log('[Housekeeper] Network Hygiene service initialized.');
    } catch (error) {
      console.error('[Housekeeper] Failed to start service:', error);
    }
  }

  /**
   * Stop the housekeeper background service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
      this.worker.terminate();
      this.worker = null;
    }
    this.isStarted = false;
    console.log('[Housekeeper] Network Hygiene service stopped.');
  }

  /**
   * Schedule pruning using requestIdleCallback for non-blocking operation
   * Ensures UI doesn't jank during cleanup
   */
  schedulePruning() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.pruneExpiredMessages();
      }, { timeout: 5000 }); // 5 second timeout to ensure cleanup runs eventually
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        this.pruneExpiredMessages();
      }, 1000);
    }
  }

  /**
   * Prune expired messages (older than 72 hours)
   * Exception: Do not delete messages marked with is_pinned: true
   */
  async pruneExpiredMessages() {
    try {
      const cutoffTime = Date.now() - this.MESSAGE_TTL_MS;
      
      console.log(`[Housekeeper] Pruning messages older than ${this.MESSAGE_TTL_MS}ms (cutoff: ${new Date(cutoffTime).toISOString()})`);

      // Use requestIdleCallback for non-blocking operation
      const deletedCount = await this._pruneWithIdleCallback(cutoffTime);

      if (deletedCount > 0) {
        console.log(`[Housekeeper] Pruned ${deletedCount} expired messages`);
      } else {
        console.log('[Housekeeper] No expired messages to prune');
      }

      return deletedCount;
    } catch (error) {
      console.error('[Housekeeper] Pruning failed:', error);
      return 0;
    }
  }

  /**
   * Prune messages using requestIdleCallback for non-blocking operation
   * @private
   */
  async _pruneWithIdleCallback(cutoffTime) {
    return new Promise((resolve) => {
      const prune = async () => {
        try {
          // Delete messages older than cutoff time, excluding pinned messages
          const deletedCount = await db.transaction('rw', db.messages, async () => {
            // Get expired messages that are not pinned
            const expiredMessages = await db.messages
              .where('timestamp')
              .below(cutoffTime)
              .and(msg => !msg.is_pinned)
              .toArray();

            // Delete them
            for (const msg of expiredMessages) {
              await db.messages.delete(msg.id);
            }

            return expiredMessages.length;
          });

          resolve(deletedCount);
        } catch (error) {
          console.error('[Housekeeper] Pruning error:', error);
          resolve(0);
        }
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prune(), { timeout: 5000 });
      } else {
        setTimeout(() => prune(), 0);
      }
    });
  }

  /**
   * getStorageStats(): Returns total message count and used storage estimate
   * Monitoring helper for UI
   */
  async getStorageStats() {
    try {
      const messageCount = await db.messages.count();
      
      // Estimate storage size (rough approximation)
      const messages = await db.messages.limit(100).toArray();
      const avgSize = messages.reduce((sum, msg) => {
        return sum + JSON.stringify(msg).length;
      }, 0) / messages.length;
      
      const estimatedStorageBytes = messageCount * avgSize;
      const estimatedStorageMB = (estimatedStorageBytes / (1024 * 1024)).toFixed(2);

      return {
        messageCount,
        estimatedStorageBytes,
        estimatedStorageMB,
        avgMessageSize: avgSize.toFixed(2)
      };
    } catch (error) {
      console.error('[Housekeeper] Failed to get storage stats:', error);
      return {
        messageCount: 0,
        estimatedStorageBytes: 0,
        estimatedStorageMB: '0.00',
        avgMessageSize: '0.00'
      };
    }
  }

  /**
   * Manual trigger for immediate cleanup
   */
  async forceCleanup() {
    console.log('[Housekeeper] Force cleanup triggered');
    return await this.pruneExpiredMessages();
  }
}

export const housekeeper = new HousekeeperService();
export default housekeeper;
