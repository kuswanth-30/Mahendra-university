/**
 * BeaconMesh Gossip Engine - Epidemic Routing with Store-and-Forward
 * 
 * Implements gossip/anti-entropy protocol for eventual consistency:
 * - generateSummaryVector(): Returns compact list of message hashes and logical timestamps
 * - compareNodes(remoteSummary): Handshake logic to determine missing data chunks (Delta)
 * 
 * Uses Version Vectors / Logical Clocks (no central server)
 */

import { db } from '../db.js';

/**
 * Local Lamport timestamp for causality tracking
 */
let lamportClock = 0;

/**
 * Gossip Engine class
 */
class GossipEngine {
  constructor() {
    this.syncStats = {
      totalSyncs: 0,
      hashesExchanged: 0,
      messagesTransferred: 0,
      lastSyncAt: null,
    };
  }

  /**
   * generateSummaryVector(): Returns compact list of message hashes and logical timestamps
   * Used for sync protocol handshake
   * 
   * @returns {Promise<Array<{hash: string, timestamp: number, vectorClock: number}>>}
   */
  async generateSummaryVector() {
    try {
      // Get all messages from database
      const messages = await db.getAllMessages();
      
      // Create compact summary vector
      const vector = messages.map(msg => ({
        hash: msg.hash,
        timestamp: msg.timestamp,
        vectorClock: msg.vectorClock || 0
      }));
      
      console.log(`[GossipEngine] Generated summary vector: ${vector.length} messages`);
      
      return vector;
    } catch (error) {
      console.error('[GossipEngine] Failed to generate summary vector:', error);
      return [];
    }
  }

  /**
   * compareNodes(remoteSummary): Handshake logic to determine missing data chunks (Delta)
   * Compares remote summary against local database
   * 
   * @param {Array<{hash: string, timestamp: number, vectorClock: number}>} remoteSummary
   * @returns {Promise<{missingFromLocal: string[], missingFromRemote: string[], summary: Object}>}
   */
  async compareNodes(remoteSummary) {
    try {
      if (!Array.isArray(remoteSummary)) {
        throw new Error('remoteSummary must be an array');
      }

      // Build lookup sets for O(1) comparison
      const remoteHashes = new Set(remoteSummary.map(v => v.hash));
      const remoteTimestamps = new Map(remoteSummary.map(v => [v.hash, v.timestamp]));

      // Get all local messages
      const localMessages = await db.getAllMessages();
      const localHashes = new Set(localMessages.map(m => m.hash));

      // Calculate differences
      const missingFromLocal = []; // Hashes remote has that we lack
      const missingFromRemote = []; // Hashes we have that remote lacks

      // Find hashes we need (remote has, we don't)
      for (const { hash, timestamp } of remoteSummary) {
        if (!localHashes.has(hash)) {
          missingFromLocal.push(hash);
        }
      }

      // Find hashes remote needs (we have, remote doesn't)
      for (const message of localMessages) {
        if (!remoteHashes.has(message.hash)) {
          missingFromRemote.push(message.hash);
        }
      }

      const summary = {
        remoteCount: remoteHashes.size,
        localCount: localHashes.size,
        missingFromLocalCount: missingFromLocal.length,
        missingFromRemoteCount: missingFromRemote.length,
        syncPercentage: remoteHashes.size > 0
          ? ((remoteHashes.size - missingFromLocal.length) / remoteHashes.size * 100).toFixed(1)
          : 100,
      };

      console.log(`[GossipEngine] Delta calculation:`, summary);

      return {
        missingFromLocal,
        missingFromRemote,
        summary,
      };

    } catch (error) {
      console.error('[GossipEngine] Error comparing nodes:', error);
      return {
        missingFromLocal: [],
        missingFromRemote: [],
        summary: { error: error.message },
      };
    }
  }

  /**
   * incrementLamportClock(): Increment local Lamport timestamp
   * @private
   */
  _incrementLamportClock() {
    lamportClock++;
    return lamportClock;
  }

  /**
   * updateLamportClock(remoteClock): Update local clock with max(local, remote) + 1
   * @private
   */
  _updateLamportClock(remoteClock) {
    lamportClock = Math.max(lamportClock, remoteClock) + 1;
    return lamportClock;
  }

  /**
   * getLamportClock(): Get current Lamport timestamp
   */
  getLamportClock() {
    return lamportClock;
  }

  /**
   * getSyncStats(): Get sync statistics
   */
  getSyncStats() {
    return this.syncStats;
  }
}

// Export singleton instance
export const gossipEngine = new GossipEngine();
export default gossipEngine;
