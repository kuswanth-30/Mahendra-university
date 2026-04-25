/**
 * Versioning Service - Logical Clock Management for Data Synchronization
 * 
 * Implements vector clock (Lamport timestamp) for causality tracking.
 * Ensures every message is assigned a logical counter instead of relying on system Date.now().
 * Provides summary vector for sync operations.
 */

import { db } from '@/lib/db';

class VersioningService {
  constructor() {
    this.localClock = 0;
    this.nodeId = null;
  }

  /**
   * Initialize the versioning service
   * @param {string} nodeId - Node identifier
   */
  initialize(nodeId) {
    this.nodeId = nodeId;
    console.log(`[VersioningService] Initialized for node: ${nodeId}`);
  }

  /**
   * Get the next vector clock value
   * Increments the local clock and returns the new value
   * @returns {number} Next vector clock value
   */
  getNextClock() {
    this.localClock++;
    return this.localClock;
  }

  /**
   * Get the current vector clock value
   * @returns {number} Current vector clock value
   */
  getCurrentClock() {
    return this.localClock;
  }

  /**
   * Merge a remote clock into local clock
   * Used when receiving messages from other nodes
   * @param {number} remoteClock - Remote clock value
   */
  mergeClock(remoteClock) {
    if (remoteClock > this.localClock) {
      this.localClock = remoteClock;
    }
  }

  /**
   * Assign vector clock to a message
   * Ensures every message gets a logical counter
   * @param {Object} message - Message to assign clock to
   * @returns {Object} Message with vector clock
   */
  assignClock(message) {
    if (!message.vectorClock) {
      message.vectorClock = this.getNextClock();
    }
    return message;
  }

  /**
   * Get summary vector from the messages table
   * Scans the messages table and returns the highest vector_clock and max_timestamp
   * Wrapped in transaction to prevent race conditions during sync
   * @returns {Promise<{highestClock: number, maxTimestamp: number, messageCount: number}>}
   */
  async getSummaryVector() {
    try {
      let highestClock = 0;
      let maxTimestamp = 0;
      let messageCount = 0;

      // Use transaction to prevent race conditions
      await db.transaction('r', db.messages, async () => {
        const messages = await db.messages.toArray();
        messageCount = messages.length;

        for (const message of messages) {
          if (message.vectorClock && message.vectorClock > highestClock) {
            highestClock = message.vectorClock;
          }
          if (message.timestamp && message.timestamp > maxTimestamp) {
            maxTimestamp = message.timestamp;
          }
        }
      });

      console.log(`[VersioningService] Summary vector: highestClock=${highestClock}, maxTimestamp=${maxTimestamp}, count=${messageCount}`);

      return {
        highestClock,
        maxTimestamp,
        messageCount
      };
    } catch (error) {
      console.error('[VersioningService] Failed to get summary vector:', error);
      return {
        highestClock: 0,
        maxTimestamp: 0,
        messageCount: 0
      };
    }
  }

  /**
   * Get per-author summary vector
   * Returns the highest vector clock per author
   * @returns {Promise<Object>} Map of { authorId: highestClock }
   */
  async getPerAuthorSummary() {
    try {
      const authorClocks = {};

      // Use transaction to prevent race conditions
      await db.transaction('r', db.messages, async () => {
        const messages = await db.messages.toArray();

        for (const message of messages) {
          const authorId = message.authorId || 'unknown';
          const clock = message.vectorClock || 0;

          if (!authorClocks[authorId] || clock > authorClocks[authorId]) {
            authorClocks[authorId] = clock;
          }
        }
      });

      console.log(`[VersioningService] Per-author summary:`, authorClocks);

      return authorClocks;
    } catch (error) {
      console.error('[VersioningService] Failed to get per-author summary:', error);
      return {};
    }
  }

  /**
   * Compare local summary with remote summary
   * Returns missing information
   * @param {Object} remoteSummary - Remote summary vector
   * @returns {Promise<{localMissing: boolean, remoteMissing: boolean, diff: Object}>}
   */
  async compareWithRemote(remoteSummary) {
    const localSummary = await this.getSummaryVector();

    const localMissing = remoteSummary.highestClock > localSummary.highestClock;
    const remoteMissing = localSummary.highestClock > remoteSummary.highestClock;

    const diff = {
      localHighestClock: localSummary.highestClock,
      remoteHighestClock: remoteSummary.highestClock,
      localMaxTimestamp: localSummary.maxTimestamp,
      remoteMaxTimestamp: remoteSummary.maxTimestamp,
      localMessageCount: localSummary.messageCount,
      remoteMessageCount: remoteSummary.messageCount
    };

    return {
      localMissing,
      remoteMissing,
      diff
    };
  }

  /**
   * Update local clock based on received message
   * Ensures causality is maintained
   * @param {number} messageClock - Clock from received message
   */
  updateClockFromMessage(messageClock) {
    if (messageClock > this.localClock) {
      this.localClock = messageClock + 1;
      console.log(`[VersioningService] Updated local clock to ${this.localClock} from message clock ${messageClock}`);
    }
  }

  /**
   * Reset the versioning service
   * Used during panic wipe or session reset
   */
  reset() {
    this.localClock = 0;
    console.log('[VersioningService] Versioning service reset');
  }
}

export const versioningService = new VersioningService();
export default versioningService;
