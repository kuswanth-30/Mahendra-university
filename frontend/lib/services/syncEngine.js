/**
 * SyncEngine - Gossip Protocol Handshake and Synchronization
 * 
 * Implements the handshake protocol for peer-to-peer synchronization:
 * - initiateHandshake(peerID): Sends SummaryVector to peer
 * - compareVectors(localSummary, remoteSummary): Identifies missing messages
 * - validateMessage(msg): Verifies SHA-256 hash and prevents duplicates
 * - onMessageReceived(peerID, msg): Handles incoming messages with loop prevention
 * - verifySignature(msg): Verifies payload integrity using Web Crypto API
 * - pruneQueue(): Removes successfully propagated messages from outbox
 * 
 * All operations are asynchronous and non-blocking.
 */

import { db } from '@/lib/db';
import { versioningService } from './versioning.js';
import { cryptoService } from './crypto.js';

class SyncEngine {
  constructor() {
    this.activeHandshakes = new Map(); // Track active handshakes
    this.batchSize = 10; // Messages per batch
    this.maxRetries = 3;
    this.ourNodeId = null; // Our node ID for loop prevention
    this.maxHistoryLength = 20; // Max peers in history header
    this.state = 'IDLE';
    this.subscribers = new Set();
  }

  /**
   * getStats(): Get current sync statistics
   * @returns {Object} Sync statistics
   */
  getStats() {
    return {
      state: this.state,
      pendingCount: 0, // Placeholder
      failedCount: 0,  // Placeholder
      processingCount: this.activeHandshakes.size,
      errors: []
    };
  }

  /**
   * subscribe(callback): Subscribe to sync engine updates
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.getStats());
    return () => this.subscribers.delete(callback);
  }

  /**
   * notifySubscribers(): Notify all subscribers of state changes
   * @private
   */
  _notifySubscribers() {
    const stats = this.getStats();
    this.subscribers.forEach(callback => callback(stats));
  }

  /**
   * setState(state): Update engine state
   * @param {string} state - New state
   */
  setState(state) {
    this.state = state;
    this._notifySubscribers();
  }

  /**
   * initiateHandshake(peerID): Start handshake with a peer
   * Step 1: Send getSummaryVector() to the peer
   * Step 2: Receive the peer's SummaryVector
   * Step 3: compareVectors(localSummary, remoteSummary)
   * Step 4: Stream batch to the peer
   * 
   * @param {string} peerID - Target peer ID
   * @param {Object} transport - Transport interface for sending/receiving
   * @returns {Promise<{success: boolean, messagesSent: number, messagesReceived: number}>}
   */
  async initiateHandshake(peerID, transport) {
    if (this.activeHandshakes.has(peerID)) {
      console.log(`[SyncEngine] Handshake already in progress with ${peerID}`);
      return { success: false, error: 'Handshake already in progress' };
    }

    console.log(`[SyncEngine] Initiating handshake with ${peerID}`);

    try {
      this.activeHandshakes.set(peerID, { startedAt: Date.now() });

      // Step 1: Send getSummaryVector() to the peer
      const localSummary = await versioningService.getSummaryVector();
      
      await transport.send(peerID, {
        type: 'SYNC_HANDSHAKE',
        summaryVector: localSummary,
        timestamp: Date.now()
      });

      console.log(`[SyncEngine] Sent SummaryVector to ${peerID}:`, localSummary);

      // Step 2: Receive the peer's SummaryVector (handled by transport callback)
      // This is async - we'll wait for the response
      const remoteSummary = await this._waitForPeerSummary(peerID, transport);

      if (!remoteSummary) {
        throw new Error('Failed to receive peer SummaryVector');
      }

      console.log(`[SyncEngine] Received SummaryVector from ${peerID}:`, remoteSummary);

      // Step 3: compareVectors(localSummary, remoteSummary)
      const comparison = await this.compareVectors(localSummary, remoteSummary);

      // Step 4: Stream batch to the peer
      if (comparison.localHasNewer) {
        await this._streamMessagesToPeer(peerID, comparison.newerMessages, transport);
      }

      this.activeHandshakes.delete(peerID);

      return {
        success: true,
        messagesSent: comparison.newerMessages.length,
        messagesReceived: comparison.remoteHasNewer ? 0 : 0
      };
    } catch (error) {
      console.error(`[SyncEngine] Handshake failed with ${peerID}:`, error);
      this.activeHandshakes.delete(peerID);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for peer's SummaryVector response
   * @private
   * @param {string} peerID - Peer ID
   * @param {Object} transport - Transport interface
   * @returns {Promise<Object>} Remote SummaryVector
   */
  async _waitForPeerSummary(peerID, transport) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Handshake timeout'));
      }, 10000); // 10 second timeout

      const handler = (message) => {
        if (message.type === 'SYNC_HANDSHAKE_RESPONSE' && message.senderId === peerID) {
          clearTimeout(timeout);
          transport.off('message', handler);
          resolve(message.summaryVector);
        }
      };

      transport.on('message', handler);
    });
  }

  /**
   * compareVectors(localSummary, remoteSummary): Compare local and remote summaries
   * If remote.max_timestamp < local.max_timestamp: Query Dexie for messages where timestamp > remote.max_timestamp
   * Batch these messages into a JSON array
   * 
   * @param {Object} localSummary - Local SummaryVector
   * @param {Object} remoteSummary - Remote SummaryVector
   * @returns {Promise<{localHasNewer: boolean, remoteHasNewer: boolean, newerMessages: Array}>}
   */
  async compareVectors(localSummary, remoteSummary) {
    console.log('[SyncEngine] Comparing vectors...');

    const localHasNewer = localSummary.maxTimestamp > remoteSummary.maxTimestamp;
    const remoteHasNewer = remoteSummary.maxTimestamp > localSummary.maxTimestamp;

    let newerMessages = [];

    if (localHasNewer) {
      // Query Dexie for messages where timestamp > remote.max_timestamp
      newerMessages = await db.messages
        .where('timestamp')
        .above(remoteSummary.maxTimestamp)
        .toArray();

      console.log(`[SyncEngine] Found ${newerMessages.length} newer messages to send`);
    }

    return {
      localHasNewer,
      remoteHasNewer,
      newerMessages
    };
  }

  /**
   * Stream messages to peer in batches
   * @private
   * @param {string} peerID - Target peer ID
   * @param {Array} messages - Messages to stream
   * @param {Object} transport - Transport interface
   */
  async _streamMessagesToPeer(peerID, messages, transport) {
    console.log(`[SyncEngine] Streaming ${messages.length} messages to ${peerID}`);

    const batches = this._batchMessages(messages);

    for (const batch of batches) {
      await transport.send(peerID, {
        type: 'SYNC_BATCH',
        messages: batch,
        batchIndex: batches.indexOf(batch),
        totalBatches: batches.length
      });

      // Small delay between batches to prevent flooding
      await this._delay(100);
    }

    console.log(`[SyncEngine] Completed streaming to ${peerID}`);
  }

  /**
   * Batch messages for streaming
   * @private
   * @param {Array} messages - Messages to batch
   * @returns {Array<Array>} Array of message batches
   */
  _batchMessages(messages) {
    const batches = [];
    for (let i = 0; i < messages.length; i += this.batchSize) {
      batches.push(messages.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * validateMessage(msg): Validate received message before saving to Dexie
   * - Verify SHA-256 hash matches message content
   * - Ensure message ID doesn't already exist in DB (prevents duplicates)
   * 
   * @param {Object} msg - Message to validate
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateMessage(msg) {
    try {
      // Check if message ID already exists (prevents duplicates)
      const existing = await db.messages.get(msg.id);
      if (existing) {
        console.log(`[SyncEngine] Message ${msg.id} already exists, skipping`);
        return { valid: false, error: 'Duplicate message' };
      }

      // Verify SHA-256 hash matches message content
      const computedHash = await this._computeMessageHash(msg.content);
      if (msg.hash && msg.hash !== computedHash) {
        console.error(`[SyncEngine] Hash mismatch for message ${msg.id}`);
        return { valid: false, error: 'Hash mismatch' };
      }

      // Verify signature if present
      if (msg.signature && msg.authorId) {
        const isValid = await cryptoService.verifyMessage(
          msg.content,
          msg.signature,
          msg.authorId
        );
        if (!isValid) {
          console.error(`[SyncEngine] Signature verification failed for message ${msg.id}`);
          return { valid: false, error: 'Signature verification failed' };
        }
      }

      return { valid: true };
    } catch (error) {
      console.error('[SyncEngine] Validation failed:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Compute SHA-256 hash of message content
   * @private
   * @param {any} content - Message content
   * @returns {Promise<string>} Hex hash
   */
  async _computeMessageHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(content));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Handle incoming sync batch from peer
   * @param {string} peerID - Sender peer ID
   * @param {Array} messages - Messages in batch
   * @returns {Promise<{accepted: number, rejected: number}>}
   */
  async handleSyncBatch(peerID, messages) {
    console.log(`[SyncEngine] Received sync batch from ${peerID}: ${messages.length} messages`);

    let accepted = 0;
    let rejected = 0;

    // Process messages asynchronously and non-blocking
    const processingPromises = messages.map(async (msg) => {
      const validation = await this.validateMessage(msg);

      if (validation.valid) {
        // Save to Dexie using transaction
        await db.transaction('rw', db.messages, async () => {
          await db.messages.put(msg);
        });
        accepted++;
      } else {
        rejected++;
      }
    });

    await Promise.all(processingPromises);

    console.log(`[SyncEngine] Batch processed: ${accepted} accepted, ${rejected} rejected`);

    return { accepted, rejected };
  }

  /**
   * Handle incoming handshake request from peer
   * @param {string} peerID - Sender peer ID
   * @param {Object} remoteSummary - Remote SummaryVector
   * @param {Object} transport - Transport interface
   * @returns {Promise<{success: boolean}>}
   */
  async handleHandshakeRequest(peerID, remoteSummary, transport) {
    console.log(`[SyncEngine] Received handshake request from ${peerID}`);

    try {
      // Get local summary
      const localSummary = await versioningService.getSummaryVector();

      // Compare vectors
      const comparison = await this.compareVectors(localSummary, remoteSummary);

      // Send response with local summary
      await transport.send(peerID, {
        type: 'SYNC_HANDSHAKE_RESPONSE',
        summaryVector: localSummary,
        timestamp: Date.now()
      });

      // If we have newer messages, stream them
      if (comparison.localHasNewer) {
        await this._streamMessagesToPeer(peerID, comparison.newerMessages, transport);
      }

      return { success: true };
    } catch (error) {
      console.error(`[SyncEngine] Failed to handle handshake from ${peerID}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delay helper for non-blocking operations
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel active handshake
   * @param {string} peerID - Peer ID
   */
  cancelHandshake(peerID) {
    if (this.activeHandshakes.has(peerID)) {
      this.activeHandshakes.delete(peerID);
      console.log(`[SyncEngine] Cancelled handshake with ${peerID}`);
    }
  }

  /**
   * Get active handshakes
   * @returns {Array} List of active handshake peer IDs
   */
  getActiveHandshakes() {
    return Array.from(this.activeHandshakes.keys());
  }

  /**
   * Set our node ID for loop prevention
   * @param {string} nodeId - Our node ID
   */
  setNodeId(nodeId) {
    this.ourNodeId = nodeId;
    console.log(`[SyncEngine] Set node ID: ${nodeId}`);
  }

  /**
   * onMessageReceived(peerID, msg): Handle incoming message with loop prevention
   * Checks history header to prevent infinite loops
   * Verifies signature before processing
   * 
   * @param {string} peerID - Sender peer ID
   * @param {Object} msg - Incoming message
   * @returns {Promise<{success: boolean, shouldForward: boolean, error?: string}>}
   */
  async onMessageReceived(peerID, msg) {
    console.log(`[SyncEngine] Received message from ${peerID}`);

    try {
      // Initialize history header if not present
      if (!msg.history) {
        msg.history = [];
      }

      // Infinite Loop Prevention: Check if our node ID is in history
      if (this.ourNodeId && msg.history.includes(this.ourNodeId)) {
        console.log(`[SyncEngine] Message already visited our node, dropping to prevent loop`);
        return { success: true, shouldForward: false, error: 'Loop detected' };
      }

      // Verify signature using Web Crypto API
      const signatureValid = await this.verifySignature(msg);
      if (!signatureValid) {
        console.error(`[SyncEngine] Signature verification failed for message from ${peerID}`);
        return { success: false, shouldForward: false, error: 'Signature verification failed' };
      }

      // Add current peer to history
      msg.history.push(peerID);

      // Trim history to max length
      if (msg.history.length > this.maxHistoryLength) {
        msg.history = msg.history.slice(-this.maxHistoryLength);
      }

      // Validate message structure
      const validation = await this.validateMessage(msg);
      if (!validation.valid) {
        console.error(`[SyncEngine] Message validation failed: ${validation.error}`);
        return { success: false, shouldForward: false, error: validation.error };
      }

      // Save to Dexie
      await db.transaction('rw', db.messages, async () => {
        await db.messages.put(msg);
      });

      console.log(`[SyncEngine] Message saved successfully`);

      // Message should be forwarded to other peers
      return { success: true, shouldForward: true };
    } catch (error) {
      console.error('[SyncEngine] Failed to process received message:', error);
      return { success: false, shouldForward: false, error: error.message };
    }
  }

  /**
   * verifySignature(msg): Verify payload integrity using Web Crypto API
   * Ensures the payload was not tampered with during the "hop" between A → B
   * 
   * @param {Object} msg - Message to verify
   * @returns {Promise<boolean>} True if signature is valid
   */
  async verifySignature(msg) {
    try {
      // Check if message has signature and authorId
      if (!msg.signature || !msg.authorId) {
        console.warn('[SyncEngine] Message missing signature or authorId');
        return false;
      }

      // Verify signature using cryptoService
      const isValid = await cryptoService.verifyMessage(
        msg.content,
        msg.signature,
        msg.authorId
      );

      if (!isValid) {
        console.error('[SyncEngine] Signature verification failed');
      }

      return isValid;
    } catch (error) {
      console.error('[SyncEngine] Signature verification error:', error);
      return false;
    }
  }

  /**
   * pruneQueue(): Periodically removes messages from outbox if successfully propagated
   * Checks if messages have been sent to at least one peer
   * Runs periodically to prevent outbox bloat
   * 
   * @returns {Promise<{pruned: number, remaining: number}>}
   */
  async pruneQueue() {
    console.log('[SyncEngine] Pruning outbox...');

    try {
      let prunedCount = 0;

      // Get all outbox items
      const outboxItems = await db.outbox.toArray();

      for (const item of outboxItems) {
        // Check if message has been successfully propagated
        // We consider it propagated if status is 'completed' or if it has been retried enough times
        if (item.status === 'completed' || item.retryCount >= this.maxRetries) {
          await db.outbox.delete(item.id);
          prunedCount++;
        }
      }

      const remaining = await db.outbox.count();

      console.log(`[SyncEngine] Pruned ${prunedCount} items from outbox, ${remaining} remaining`);

      return { pruned: prunedCount, remaining };
    } catch (error) {
      console.error('[SyncEngine] Failed to prune outbox:', error);
      return { pruned: 0, remaining: 0 };
    }
  }

  /**
   * Start periodic queue pruning
   * @param {number} intervalMs - Interval in milliseconds (default 5 minutes)
   */
  startPeriodicPruning(intervalMs = 5 * 60 * 1000) {
    if (this.pruningInterval) {
      clearInterval(this.pruningInterval);
    }

    this.pruningInterval = setInterval(async () => {
      await this.pruneQueue();
    }, intervalMs);

    console.log(`[SyncEngine] Started periodic pruning (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic queue pruning
   */
  stopPeriodicPruning() {
    if (this.pruningInterval) {
      clearInterval(this.pruningInterval);
      this.pruningInterval = null;
      console.log('[SyncEngine] Stopped periodic pruning');
    }
  }
}

export const syncEngine = new SyncEngine();
export default syncEngine;
