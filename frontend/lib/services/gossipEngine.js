/**
 * GossipEngine - Anti-Entropy Sync for 404 Found Mesh Network
 * 
 * Implements gossip/anti-entropy protocol for eventual consistency in DTN environments:
 * 1. generateDataVector() - Returns hashes of all data we possess
 * 2. generateBloomFilter() - Creates Bloom Filter for efficient comparison
 * 3. compareNodes() - Compares Bloom Filters to find missing data
 * 4. compareVectors() - Calculates Missing Data Vector (hashes peer has that we lack)
 * 5. prepareSyncPayload() - Fetches actual message blobs for requested hashes
 * 6. sendHandshake() - Broadcasts VersionVector to connected peers
 * 7. validateAndStore() - Security middleware for signature verification
 * 8. onPeerConnect() - Handshake protocol for peer connection
 * 9. calculateDelta() - Compare remote summary against local store
 * 10. syncData() - Request missing payloads from peer
 * 11. Loop Prevention - propagation_history tracking
 * 
 * Optimized for intermittent connectivity and high-latency mesh networks.
 */

import { db } from '@/lib/db';
import { cryptoService } from './crypto.js';
import { BloomFilter } from 'bloom-filters';
import { SchemaValidator } from './schema.js';
import { transportManager } from './transportManager.js';
import { routerService } from './router.js';
import { geospatialService } from './geospatial.js';

/**
 * Local Lamport timestamp for causality tracking
 */
let lamportClock = 0;

/**
 * VersionVector - Mapping of { peer_id: counter } for causality tracking
 * @typedef {Object} VersionVector
 * @property {Object} [peerId: number] - Peer ID to counter mapping
 */

/**
 * Blacklist for peers that failed signature verification
 * @type {Map<string, {blacklistedAt: number, expiresAt: number}>}
 */
const peerBlacklist = new Map();

/**
 * Data vector entry - minimal info for comparison
 * @typedef {Object} DataVectorEntry
 * @property {string} hash - Message hash/ID
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {number} [vectorClock] - Lamport timestamp for causality
 */

/**
 * Sync payload entry - actual message data
 * @typedef {Object} SyncPayloadEntry
 * @property {string} hash - Message hash/ID
 * @property {any} payload - Message content
 * @property {string} contentType - Type identifier
 * @property {number} timestamp - Creation timestamp
 * @property {number} [vectorClock] - Lamport timestamp
 */

/**
 * Gossip Engine for mesh anti-entropy sync
 */
class GossipEngine {
  constructor() {
    this.syncStats = {
      totalSyncs: 0,
      hashesExchanged: 0,
      messagesTransferred: 0,
      lastSyncAt: null,
    };
    this.compressionEnabled = true; // Enable for large vectors
    this.maxVectorSize = 1000; // Max hashes to include in one vector
  }

  /**
   * getSyncStats(): Returns synchronization statistics for UI
   * @returns {Object}
   */
  getSyncStats() {
    return this.syncStats;
  }

  /**
   * generateBloomFilter(): Creates a Bloom Filter of all local message hashes
   * Efficient space-efficient representation for gossip comparison
   * 
   * @param {Object} options - Generation options
   * @param {number} [options.errorRate=0.01] - False positive rate (1%)
   * @param {number} [options.capacity=1000] - Expected number of items
   * @returns {Promise<{filter: BloomFilter, hashCount: number, serialized: string}>}
   */
  async generateBloomFilter(options = {}) {
    const { errorRate = 0.01, capacity = 1000 } = options;

    try {
      // Get all message hashes from Dexie
      const hashes = await db.messageHashes.toCollection().primaryKeys();
      
      // Create Bloom Filter
      const filter = BloomFilter.create(capacity, errorRate);
      
      // Add all hashes to the filter
      for (const hash of hashes) {
        filter.add(hash);
      }

      // Serialize for transmission
      const serialized = filter.saveAsJSON();

      console.log(`[GossipEngine] Bloom Filter created: ${hashes.length} hashes, error rate: ${errorRate}`);
      
      return {
        filter,
        hashCount: hashes.length,
        serialized: JSON.stringify(serialized)
      };
    } catch (error) {
      console.error('[GossipEngine] Bloom Filter generation failed:', error);
      return { filter: null, hashCount: 0, serialized: null };
    }
  }

  /**
   * compareNodes(remoteFilter): Compares local Bloom Filter against peer's filter
   * Returns list of 'Missing IDs' where remote filter has bits set but local doesn't
   * 
   * @param {Object} remoteFilterData - Peer's serialized Bloom Filter data
   * @param {string} remoteFilterData.serialized - Serialized Bloom Filter JSON
   * @returns {Promise<{missingFromLocal: string[], missingFromRemote: string[]}>}
   */
  async compareNodes(remoteFilterData) {
    try {
      console.log('[GossipEngine] Comparing Bloom Filters...');
      
      // Generate local Bloom Filter
      const localData = await this.generateBloomFilter();
      if (!localData.filter) {
        return { missingFromLocal: [], missingFromRemote: [] };
      }

      // Reconstruct remote Bloom Filter
      const remoteJSON = JSON.parse(remoteFilterData.serialized);
      const remoteFilter = BloomFilter.fromJSON(remoteJSON);

      // Get all local hashes
      const localHashes = await db.messageHashes.toCollection().primaryKeys();
      
      // Find hashes we need (peer has, we don't)
      const missingFromLocal = [];
      for (const hash of localHashes) {
        if (!remoteFilter.has(hash)) {
          missingFromLocal.push(hash);
        }
      }

      // Find hashes peer needs (we have, peer doesn't)
      const missingFromRemote = [];
      for (const hash of localHashes) {
        if (!localData.filter.has(hash)) {
          // This is a probabilistic check - may have false positives
          // We'll verify by checking actual hash list if needed
          missingFromRemote.push(hash);
        }
      }

      console.log(`[GossipEngine] Bloom Filter comparison: Need ${missingFromLocal.length}, Peer needs ${missingFromRemote.length}`);
      
      return { missingFromLocal, missingFromRemote };
    } catch (error) {
      console.error('[GossipEngine] Bloom Filter comparison failed:', error);
      return { missingFromLocal: [], missingFromRemote: [] };
    }
  }

  /**
   * generateSummaryVector(): Returns minified array of [id, timestamp] for all messages
   * Summary Exchange Service for Epidemic Sync Protocol
   * 
   * @param {Object} options - Generation options
   * @param {boolean} [options.useBloomFilter=false] - Use Bloom Filter for high message counts
   * @param {number} [options.bloomThreshold=1000] - Threshold for using Bloom Filter
   * @returns {Promise<{vector: Array<[string, number]>, bloomFilter?: string, count: number}>}
   */
  async generateSummaryVector(options = {}) {
    const { useBloomFilter = false, bloomThreshold = 1000 } = options;

    try {
      // Get all messages from Dexie
      const messages = await db.messages.toArray();
      const count = messages.length;

      // Bloom Filter optimization for high message counts
      if (useBloomFilter && count > bloomThreshold) {
        console.log(`[GossipEngine] Using Bloom Filter for ${count} messages`);
        const bloomData = await this.generateBloomFilter({
          capacity: count,
          errorRate: 0.01
        });
        
        return {
          vector: messages.map(m => [m.id, m.timestamp]),
          bloomFilter: bloomData.serialized,
          count,
          usingBloomFilter: true
        };
      }

      // Return minified array of [id, timestamp]
      const vector = messages.map(m => [m.id, m.timestamp]);
      
      console.log(`[GossipEngine] Generated summary vector: ${count} messages`);
      
      return {
        vector,
        count,
        usingBloomFilter: false
      };
    } catch (error) {
      console.error('[GossipEngine] Error generating summary vector:', error);
      return { vector: [], count: 0, usingBloomFilter: false };
    }
  }

  /**
   * generateStateVector(): Computes the summary of all local data
   * Returns a JSON map of { messageId: timestamp } for all messages in local Dexie
   * 
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - State vector as { messageId: timestamp } map
   */
  async generateStateVector(options = {}) {
    const vector = await this.generateDataVector(options);
    const stateVector = {};
    vector.forEach(entry => {
      stateVector[entry.hash] = entry.timestamp;
    });
    return stateVector;
  }

  /**
   * generateSummary(): Returns a list of message hashes (IDs) the device possesses
   * Wrapper around generateDataVector for API compatibility
   * 
   * @param {Object} options - Generation options
   * @returns {Promise<string[]>} - Array of message hashes/IDs
   */
  async generateSummary(options = {}) {
    const vector = await this.generateDataVector(options);
    return vector.map(entry => entry.hash);
  }

  /**
   * Generate a data vector representing all messages we possess
   * 
   * Returns a compact array of {hash, timestamp, vectorClock} entries.
   * Used during handshake to let peers know what we have.
   * 
   * @param {Object} options - Generation options
   * @param {number} [options.since] - Only include hashes newer than this timestamp
   * @param {number} [options.limit] - Max entries to include (default: 1000)
   * @param {boolean} [options.includeVectorClock] - Include Lamport timestamps
   * @returns {Promise<DataVectorEntry[]>} - Data vector for sync
   */
  async generateDataVector(options = {}) {
    const { since, limit = this.maxVectorSize, includeVectorClock = true } = options;

    try {
      let hashes;

      if (since) {
        // Incremental sync: only newer hashes
        hashes = await db.getHashesSince(since);
      } else {
        // Full sync: all hashes
        hashes = await db.getAllHashes();
      }

      // Sort by timestamp (newest first) and limit
      hashes = hashes
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      // Build compact vector
      const vector = hashes.map(h => ({
        hash: h.id,
        timestamp: h.timestamp,
        ...(includeVectorClock && h.vectorClock ? { vectorClock: h.vectorClock } : {}),
      }));

      console.log(`[GossipEngine] Generated vector: ${vector.length} hashes`);
      return vector;

    } catch (error) {
      console.error('[GossipEngine] Error generating data vector:', error);
      return [];
    }
  }

  /**
   * computeDelta(remoteVector): Delta Calculation for Epidemic Sync Protocol
   * Compares remote vector with local messages table
   * Returns list of missing_ids (messages present in remote but not local, and vice-versa)
   * Now includes geospatial filtering using Haversine formula
   * 
   * @param {Array<{id: string, timestamp: number, lat?: number, long?: number, radius?: number}>} remoteVector - Remote summary vector
   * @returns {Promise<{missingFromLocal: string[], missingFromRemote: string[], summary: Object}>}
   */
  async computeDelta(remoteVector) {
    try {
      if (!Array.isArray(remoteVector)) {
        throw new Error('remoteVector must be an array');
      }

      // Build lookup sets for O(1) comparison
      const remoteIds = new Set(remoteVector.map(v => v.id));
      const remoteTimestamps = new Map(remoteVector.map(v => [v.id, v.timestamp]));
      const remoteMessages = new Map(remoteVector.map(v => [v.id, v]));

      // Get all local messages
      const localMessages = await db.messages.toArray();
      const localIds = new Set(localMessages.map(m => m.id));

      // Calculate differences
      const missingFromLocal = []; // IDs remote has that we lack
      const missingFromRemote = []; // IDs we have that remote lacks
      const skippedByGeospatial = []; // IDs skipped due to geospatial filtering

      // Find IDs we need (remote has, we don't)
      for (const remoteMsg of remoteVector) {
        if (!localIds.has(remoteMsg.id)) {
          // Geospatial filtering: Check if message is within radius
          if (remoteMsg.lat !== undefined && remoteMsg.long !== undefined && remoteMsg.radius !== undefined) {
            const isWithinRadius = geospatialService.isWithinRadius(
              remoteMsg.lat,
              remoteMsg.long,
              remoteMsg.radius
            );

            if (!isWithinRadius) {
              console.log(`[GossipEngine] Skipping message ${remoteMsg.id} - outside geospatial radius`);
              skippedByGeospatial.push(remoteMsg.id);
              continue; // Skip adding to sync queue
            }
          }

          missingFromLocal.push(remoteMsg.id);
        }
      }

      // Find IDs remote needs (we have, remote doesn't)
      for (const message of localMessages) {
        if (!remoteIds.has(message.id)) {
          // Geospatial filtering: Check if message is within radius
          if (message.lat !== undefined && message.long !== undefined && message.radius !== undefined) {
            const isWithinRadius = geospatialService.isWithinRadius(
              message.lat,
              message.long,
              message.radius
            );

            if (!isWithinRadius) {
              console.log(`[GossipEngine] Skipping message ${message.id} - outside geospatial radius`);
              skippedByGeospatial.push(message.id);
              continue; // Skip adding to sync queue
            }
          }

          missingFromRemote.push(message.id);
        }
      }

      const summary = {
        remoteCount: remoteIds.size,
        localCount: localIds.size,
        missingFromLocalCount: missingFromLocal.length,
        missingFromRemoteCount: missingFromRemote.length,
        skippedByGeospatialCount: skippedByGeospatial.length,
        syncPercentage: remoteIds.size > 0
          ? ((remoteIds.size - missingFromLocal.length) / remoteIds.size * 100).toFixed(1)
          : 100,
      };

      console.log(`[GossipEngine] Delta calculation:`, summary);

      return {
        missingFromLocal,
        missingFromRemote,
        skippedByGeospatial,
        summary,
      };

    } catch (error) {
      console.error('[GossipEngine] Error computing delta:', error);
      return {
        missingFromLocal: [],
        missingFromRemote: [],
        skippedByGeospatial: [],
        summary: { error: error.message },
      };
    }
  }

  /**
   * onPeerConnect(peerNode): Handshake protocol for peer connection
   * Receives peer summary and initiates sync
   * 
   * @param {Object} peerNode - Peer node object with id and summary
   * @returns {Promise<{success: boolean, missingHashes?: string[], error?: string}>}
   */
  async onPeerConnect(peerNode) {
    try {
      const peerId = peerNode.id || peerNode.peerId;
      const peerSummary = peerNode.summary;

      console.log(`[GossipEngine] Peer connected: ${peerId}`);

      // Check if peer is blacklisted
      if (this._isPeerBlacklisted(peerId)) {
        console.warn(`[GossipEngine] Peer ${peerId} is blacklisted, skipping handshake`);
        return { success: false, error: 'Peer is blacklisted' };
      }

      // Generate local summary
      const localSummary = await this.generateSummaryVector();

      // Calculate delta - identify missing message hashes
      const delta = await this.calculateDelta(peerSummary);

      console.log(`[GossipEngine] Handshake complete with ${peerId}: missingFromLocal=${delta.missingFromLocal.length}, missingFromRemote=${delta.missingFromRemote.length}`);

      return {
        success: true,
        missingHashes: delta.missingFromLocal,
        localSummary: localSummary.vector
      };
    } catch (error) {
      console.error('[GossipEngine] Handshake failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * calculateDelta(peerSummary): Compare remote summary against local DataCentricStore
   * Identifies missing message hashes
   * 
   * @param {Object} peerSummary - Peer's summary vector
   * @returns {Promise<{missingFromLocal: string[], missingFromRemote: string[], summary: Object}>}
   */
  async calculateDelta(peerSummary) {
    // Alias for computeDelta for API compatibility
    return await this.computeDelta(peerSummary);
  }

  /**
   * syncData(missingHashes): Request only the missing payloads from the peer
   * Uses TransportManager for data transfer
   * 
   * @param {string[]} missingHashes - List of message hashes to request
   * @param {Object} peerNode - Peer node to request from
   * @returns {Promise<{success: boolean, messages?: any[], error?: string}>}
   */
  async syncData(missingHashes, peerNode) {
    try {
      if (!Array.isArray(missingHashes) || missingHashes.length === 0) {
        return { success: true, messages: [] };
      }

      console.log(`[GossipEngine] Requesting ${missingHashes.length} missing messages from peer`);

      // Use TransportManager to request data from peer
      const requestBuffer = this._encodeSyncRequest(missingHashes);
      const peerId = peerNode.id || peerNode.peerId;
      
      const result = await transportManager.sendData(peerId, requestBuffer);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // For now, we'll use prepareSyncPayload to fetch from local store (for testing)
      // In production, this would decode the response from the peer
      const payload = await this.prepareSyncPayload(missingHashes);

      return {
        success: true,
        messages: payload.payloads
      };
    } catch (error) {
      console.error('[GossipEngine] Sync data failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * _encodeSyncRequest(hashes): Encode sync request for transport
   * @private
   */
  _encodeSyncRequest(hashes) {
    const request = {
      type: 'sync-request',
      hashes: hashes,
      timestamp: Date.now()
    };
    const jsonString = JSON.stringify(request);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString);
  }

  /**
   * checkLoopPrevention(message, neighborId): Check if message should be dropped due to loop
   * Every message includes propagation_history (set of node IDs it has visited)
   * 
   * @param {Object} message - Message object with propagation_history
   * @param {string} neighborId - Neighbor's node ID
   * @returns {boolean} True if message should be dropped (loop detected)
   */
  checkLoopPrevention(message, neighborId) {
    if (!message.propagation_history) {
      return false; // No history, allow forwarding
    }

    const history = Array.isArray(message.propagation_history) 
      ? message.propagation_history 
      : new Set(message.propagation_history);

    // Check if neighbor ID is in propagation_history
    if (history.includes(neighborId) || history.has(neighborId)) {
      console.log(`[GossipEngine] Loop prevention: Message already visited ${neighborId}, dropping`);
      return true; // Drop the message
    }

    return false; // Safe to forward
  }

  /**
   * addToPropagationHistory(message, nodeId): Add node ID to message's propagation history
   * 
   * @param {Object} message - Message object
   * @param {string} nodeId - Current node ID
   * @returns {Object} Message with updated propagation history
   */
  addToPropagationHistory(message, nodeId) {
    if (!message.propagation_history) {
      message.propagation_history = [nodeId];
    } else if (Array.isArray(message.propagation_history)) {
      message.propagation_history.push(nodeId);
    } else {
      // Convert Set to Array for serialization
      message.propagation_history = Array.from(message.propagation_history);
      message.propagation_history.push(nodeId);
    }

    return message;
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
   * Compare our data vector with peer's vector to find missing data
   * 
   * Calculates the "Missing Data Vector" - hashes the peer has that we are missing.
   * Uses bloom-filter-like optimization for large vectors.
   * 
   * @param {DataVectorEntry[]} peerVector - Peer's data vector
   * @param {Object} options - Comparison options
   * @param {boolean} [options.wantMissing=true] - Return hashes we need (vs. hashes peer needs)
   * @returns {Promise<{missingHashes: string[], theirMissingHashes: string[], summary: Object}>}
   */
  async compareVectors(peerVector, options = {}) {
    const { wantMissing = true } = options;

    try {
      if (!Array.isArray(peerVector)) {
        throw new Error('peerVector must be an array');
      }

      // Build lookup sets for O(1) comparison
      const peerHashes = new Set(peerVector.map(v => v.hash));
      const peerHashMap = new Map(peerVector.map(v => [v.hash, v]));

      // Get all our hashes
      const ourHashes = await db.messageHashes.toCollection().primaryKeys();
      const ourHashSet = new Set(ourHashes);

      // Calculate differences
      const missingHashes = []; // Hashes peer has that we lack
      const theirMissingHashes = []; // Hashes we have that peer lacks

      // Find hashes we need (peer has, we don't)
      for (const hash of peerHashes) {
        if (!ourHashSet.has(hash)) {
          missingHashes.push(hash);
        }
      }

      // Find hashes peer needs (we have, peer doesn't)
      for (const hash of ourHashes) {
        if (!peerHashes.has(hash)) {
          theirMissingHashes.push(hash);
        }
      }

      // Sort by timestamp (oldest first) for efficient sync
      const sortedMissing = await this._sortHashesByTimestamp(missingHashes);
      const sortedTheirMissing = await this._sortHashesByTimestamp(theirMissingHashes);

      const summary = {
        peerHashCount: peerHashes.size,
        ourHashCount: ourHashes.length,
        missingCount: sortedMissing.length,
        theirMissingCount: sortedTheirMissing.length,
        syncPercentage: peerHashes.size > 0
          ? ((peerHashes.size - sortedMissing.length) / peerHashes.size * 100).toFixed(1)
          : 100,
      };

      console.log(`[GossipEngine] Vector comparison:`, summary);

      return {
        missingHashes: wantMissing ? sortedMissing : sortedTheirMissing,
        theirMissingHashes: wantMissing ? sortedTheirMissing : sortedMissing,
        summary,
      };

    } catch (error) {
      console.error('[GossipEngine] Error comparing vectors:', error);
      return {
        missingHashes: [],
        theirMissingHashes: [],
        summary: { error: error.message },
      };
    }
  }

  /**
   * Prepare sync payload - fetch actual message blobs for requested hashes
   * 
   * Retrieves full message data for hashes requested by peer.
   * Respects bandwidth limits by chunking large requests.
   * 
   * @param {string[]} requestedHashes - Hashes peer is requesting
   * @param {Object} options - Payload options
   * @param {number} [options.chunkSize=5] - Max messages per chunk (low-bandwidth constraint)
   * @param {boolean} [options.includeMetadata=true] - Include sync metadata
   * @returns {Promise<{payloads: SyncPayloadEntry[], hasMore: boolean, chunkIndex: number}>}
   */
  async prepareSyncPayload(requestedHashes, options = {}) {
    const { chunkSize = 5, includeMetadata = true, chunkIndex = 0, signMessages = true } = options;

    try {
      if (!Array.isArray(requestedHashes) || requestedHashes.length === 0) {
        return {
          payloads: [],
          hasMore: false,
          chunkIndex: 0,
          totalRequested: 0,
        };
      }

      // Calculate chunk boundaries
      const start = chunkIndex * chunkSize;
      const end = start + chunkSize;
      const chunk = requestedHashes.slice(start, end);
      const hasMore = end < requestedHashes.length;

      // Initialize crypto service if signing is enabled
      if (signMessages && !cryptoService.isReady()) {
        await cryptoService.initialize();
      }

      // Fetch blobs for this chunk
      const payloads = await Promise.all(
        chunk.map(async (hash) => {
          try {
            const [blob, hashEntry] = await Promise.all([
              db.messageBlobs.get(hash),
              db.messageHashes.get(hash),
            ]);

            if (!blob) {
              console.warn(`[GossipEngine] Blob not found for hash: ${hash}`);
              return null;
            }

            // Build payload entry
            const payloadEntry = {
              hash: blob.id,
              payload: blob.payload,
              contentType: blob.contentType,
              timestamp: blob.createdAt,
              ...(includeMetadata && hashEntry?.vectorClock
                ? { vectorClock: hashEntry.vectorClock }
                : {}),
              ...(includeMetadata && hashEntry?.peerId
                ? { peerId: hashEntry.peerId }
                : {}),
            };

            // SECURITY: Sign the payload before sending
            if (signMessages && cryptoService.isReady()) {
              try {
                const signedPayload = await cryptoService.signMessage(payloadEntry);
                payloadEntry.payload = signedPayload; // Replace with signed envelope
                console.log(`[GossipEngine] Signed message ${hash} with key ${cryptoService.getKeyId()}`);
              } catch (signError) {
                console.error(`[GossipEngine] Failed to sign message ${hash}:`, signError);
                // Continue with unsigned payload (or could reject based on policy)
              }
            }

            return payloadEntry;
          } catch (error) {
            console.error(`[GossipEngine] Error fetching blob ${hash}:`, error);
            return null;
          }
        })
      );

      // Filter out failed fetches
      const validPayloads = payloads.filter(p => p !== null);

      console.log(`[GossipEngine] Prepared payload: ${validPayloads.length}/${chunk.length} messages (chunk ${chunkIndex}, signed: ${signMessages})`);

      return {
        payloads: validPayloads,
        hasMore,
        chunkIndex,
        totalRequested: requestedHashes.length,
        chunkSize,
      };

    } catch (error) {
      console.error('[GossipEngine] Error preparing sync payload:', error);
      return {
        payloads: [],
        hasMore: false,
        chunkIndex: 0,
        totalRequested: requestedHashes.length,
        error: error.message,
      };
    }
  }

  /**
   * computeDelta(remoteVector): Compare remote vector against local Dexie and return missing IDs
   * Wrapper around compareVectors for API compatibility
   * 
   * @param {DataVectorEntry[]} remoteVector - Peer's data vector
   * @returns {Promise<string[]>} - List of missing Message IDs
   */
  async computeDelta(remoteVector) {
    const result = await this.compareVectors(remoteVector, { wantMissing: true });
    return result.missingHashes;
  }

  /**
   * pushMissingData(requestedIDs): Fetch payloads from Dexie and prepare for stream transmission
   * Wrapper around prepareSyncPayload for API compatibility
   * 
   * @param {string[]} requestedIDs - Message IDs peer is requesting
   * @param {Object} options - Payload options
   * @returns {Promise<{payloads: SyncPayloadEntry[], hasMore: boolean}>}
   */
  async pushMissingData(requestedIDs, options = {}) {
    return await this.prepareSyncPayload(requestedIDs, options);
  }

  /**
   * Process received sync payload - store incoming messages
   * 
   * @param {SyncPayloadEntry[]} payloads - Received message payloads
   * @param {string} peerId - Source peer ID
   * @returns {Promise<{stored: number, conflicts: number, errors: number}>}
   */
  async processSyncPayload(payloads, peerId) {
    if (!Array.isArray(payloads)) {
      return { stored: 0, conflicts: 0, errors: 0, rejected: 0 };
    }

    let stored = 0;
    let conflicts = 0;
    let errors = 0;
    let rejected = 0; // Count of messages rejected due to failed verification

    // Ensure crypto service is initialized
    if (!cryptoService.isReady()) {
      await cryptoService.initialize();
    }

    for (const entry of payloads) {
      try {
        // SECURITY: Verify message signature before processing
        // Check if payload is a signed message (has signature field)
        if (entry.payload && entry.payload.signature) {
          const verification = await cryptoService.verifyMessage(entry.payload);

          if (!verification.valid) {
            // Signature verification failed - reject message
            console.warn(`[GossipEngine] REJECTED message ${entry.hash} from ${peerId}: ${verification.error}`);
            console.warn(`[GossipEngine] Tampered: ${verification.tampered ? 'YES' : 'NO'}`);
            rejected++;
            continue; // Skip storing this message
          }

          // Signature valid - extract the actual payload
          console.log(`[GossipEngine] VERIFIED message ${entry.hash} from ${peerId}`);
          // Replace the signed envelope with the actual payload for storage
          entry.payload = verification.payload;
        } else {
          // Unsigned message - log warning but still process (optional: reject all unsigned)
          console.warn(`[GossipEngine] Unsigned message ${entry.hash} from ${peerId} - processing but not verified`);
          // To enforce strict security, uncomment below:
          // console.warn(`[GossipEngine] REJECTED unsigned message ${entry.hash}`);
          // rejected++;
          // continue;
        }

        // Check for existing hash (potential conflict)
        const exists = await db.hasHash(entry.hash);
        
        if (exists) {
          // Check for vector clock conflict
          const existing = await db.messageHashes.get(entry.hash);
          if (existing?.vectorClock && entry.vectorClock) {
            if (entry.vectorClock > existing.vectorClock) {
              // Newer version - update
              await db.storeMessage(entry.hash, entry.payload, entry.contentType, {
                peerId,
                vectorClock: entry.vectorClock,
              });
              stored++;
            } else {
              conflicts++;
            }
          } else {
            conflicts++;
          }
        } else {
          // New message - store it
          await db.storeMessage(entry.hash, entry.payload, entry.contentType, {
            peerId,
            vectorClock: entry.vectorClock,
          });
          stored++;
        }
      } catch (error) {
        console.error(`[GossipEngine] Error storing message ${entry.hash}:`, error);
        errors++;
      }
    }

    console.log(`[GossipEngine] Processed payload: ${stored} stored, ${conflicts} conflicts, ${errors} errors, ${rejected} rejected (security)`);
    return { stored, conflicts, errors, rejected };
  }

  /**
   * Full anti-entropy sync with a peer
   * 
   * Orchestrates the complete gossip protocol:
   * 1. Exchange data vectors
   * 2. Determine missing hashes
   * 3. Request and transfer payloads
   * 4. Store received messages
   * 
   * @param {Function} sendToPeer - Function to send data to peer
   * @param {Function} receiveFromPeer - Function to receive data from peer
   * @returns {Promise<{success: boolean, messagesReceived: number, messagesSent: number}>}
   */
  async performFullSync(sendToPeer, receiveFromPeer) {
    const sessionId = this._generateSessionId();
    console.log(`[GossipEngine] Starting sync session ${sessionId}`);

    try {
      // Step 1: Generate our vector
      const ourVector = await this.generateDataVector();

      // Step 2: Exchange vectors (simplified - real implementation would use callbacks)
      await sendToPeer({ type: 'VECTOR', vector: ourVector, sessionId });
      const peerResponse = await receiveFromPeer();

      if (peerResponse.type !== 'VECTOR') {
        throw new Error('Expected vector response from peer');
      }

      // Step 3: Compare vectors
      const { missingHashes, theirMissingHashes } = await this.compareVectors(
        peerResponse.vector
      );

      // Step 4: Request missing hashes from peer
      let messagesReceived = 0;
      if (missingHashes.length > 0) {
        await sendToPeer({
          type: 'REQUEST_PAYLOADS',
          hashes: missingHashes,
          sessionId,
        });

        const payloadResponse = await receiveFromPeer();
        if (payloadResponse.type === 'PAYLOADS') {
          const result = await this.processSyncPayload(
            payloadResponse.payloads,
            peerResponse.peerId
          );
          messagesReceived = result.stored;
        }
      }

      // Step 5: Send payloads peer is missing
      let messagesSent = 0;
      if (theirMissingHashes.length > 0) {
        const syncPayload = await this.prepareSyncPayload(theirMissingHashes);
        await sendToPeer({
          type: 'PAYLOADS',
          payloads: syncPayload.payloads,
          hasMore: syncPayload.hasMore,
          sessionId,
        });
        messagesSent = syncPayload.payloads.length;
      }

      // Step 6: Complete sync
      await sendToPeer({ type: 'SYNC_COMPLETE', sessionId });

      // Update stats
      this.syncStats.totalSyncs++;
      this.syncStats.hashesExchanged += ourVector.length + peerResponse.vector.length;
      this.syncStats.messagesTransferred += messagesSent + messagesReceived;
      this.syncStats.lastSyncAt = Date.now();

      console.log(`[GossipEngine] Sync ${sessionId} complete: ${messagesReceived} received, ${messagesSent} sent`);

      return {
        success: true,
        messagesReceived,
        messagesSent,
        sessionId,
      };

    } catch (error) {
      console.error(`[GossipEngine] Sync ${sessionId} failed:`, error);
      return {
        success: false,
        messagesReceived: 0,
        messagesSent: 0,
        sessionId,
        error: error.message,
      };
    }
  }

  /**
   * Get sync statistics
   * @returns {Object} Sync stats
   */
  getStats() {
    return { ...this.syncStats };
  }

  /**
   * Reset sync statistics
   */
  resetStats() {
    this.syncStats = {
      totalSyncs: 0,
      hashesExchanged: 0,
      messagesTransferred: 0,
      lastSyncAt: null,
    };
  }

  /**
   * generateStateVector(): Computes a summary of all local message IDs and their timestamps.
   * Format: { [messageId]: timestamp }
   * 
   * @returns {Promise<Record<string, number>>} State vector map
   */
  async generateStateVector() {
    try {
      const messages = await db.messages.toArray();
      const vector = {};
      messages.forEach(msg => {
        vector[msg.id] = msg.timestamp;
      });
      return vector;
    } catch (error) {
      console.error('[GossipEngine] Failed to generate state vector:', error);
      return {};
    }
  }

  /**
   * compareVectors(peerVector): Compares local vs. remote vectors.
   * Identifies delta for epidemic routing.
   * 
   * @param {Record<string, number>} peerVector - Remote peer's state vector
   * @returns {Promise<{missingFromLocal: string[], missingFromRemote: string[]}>}
   */
  async compareVectors(peerVector) {
    const localVector = await this.generateStateVector();
    const missingFromLocal = [];
    const missingFromRemote = [];

    // Find messages peer has that we don't
    for (const [id, timestamp] of Object.entries(peerVector)) {
      if (!localVector[id]) {
        missingFromLocal.push(id);
      }
    }

    // Find messages we have that peer doesn't
    for (const [id, timestamp] of Object.entries(localVector)) {
      if (!peerVector[id]) {
        missingFromRemote.push(id);
      }
    }

    return { missingFromLocal, missingFromRemote };
  }

  /**
   * syncProtocol(): Orchestrates the Gossip/Handshake flow in batches.
   * Designed for low-bandwidth environments (WebRTC/BLE).
   * 
   * @param {string} peerId 
   * @param {Object} transport - Abstracted transport (WebRTC/BLE stream)
   */
  async syncProtocol(peerId, transport) {
    console.log(`[GossipSync] Starting handshake with ${peerId}`);
    
    try {
      // 1. Generate and send local state vector
      const localVector = await this.generateStateVector();
      await transport.send(peerId, { type: 'GOSSIP_VECTOR', vector: localVector });

      // 2. Peer should respond with their vector (handled via transport event)
      // For this logic, we assume we receive the peerVector back
      
      // NOTE: The actual 'Receive' logic is handled by meshNode.js 
      // which then calls reconcileSync below.
    } catch (error) {
      console.error('[GossipSync] Handshake failed:', error);
    }
  }

  /**
   * Reconcile missing data and fetch in batches of 5
   * 
   * @param {string} peerId 
   * @param {Record<string, number>} peerVector 
   * @param {Object} transport 
   */
  async reconcileSync(peerId, peerVector, transport) {
    const { missingFromLocal, missingFromRemote } = await this.compareVectors(peerVector);
    
    console.log(`[GossipSync] Reconciling: Need ${missingFromLocal.length}, Peer needs ${missingFromRemote.length}`);

    // BATCHED TRANSFER (5 messages at a time)
    const BATCH_SIZE = 5;

    // A. Request missing data from peer in batches
    for (let i = 0; i < missingFromLocal.length; i += BATCH_SIZE) {
      const batch = missingFromLocal.slice(i, i + BATCH_SIZE);
      console.log(`[GossipSync] Requesting batch ${i/BATCH_SIZE + 1} (${batch.length} IDs)`);
      await transport.send(peerId, { type: 'GOSSIP_REQUEST_PAYLOADS', hashes: batch });
    }

    // B. Proactively send data peer is missing in batches
    for (let i = 0; i < missingFromRemote.length; i += BATCH_SIZE) {
      const batch = missingFromRemote.slice(i, i + BATCH_SIZE);
      const payloads = await this.prepareSyncPayload(batch);
      console.log(`[GossipSync] Sending batch ${i/BATCH_SIZE + 1} (${payloads.length} payloads)`);
      await transport.send(peerId, { type: 'GOSSIP_PAYLOADS', payloads });
    }
  }

  /**
   * compareWithPeer(): Compares the remote summary against local Dexie DB
   * identifies the 'Missing Data Vector' (hashes we don't have)
   * 
   * @param {string[]} peerSummary - List of hashes from peer
   * @returns {Promise<{missingHashes: string[]}>}
   */
  async compareWithPeer(peerSummary) {
    console.log(`[GossipEngine] Comparing with peer summary (${peerSummary.length} hashes)`);
    try {
      // Map summary to the format expected by compareVectors
      const peerVector = peerSummary.map(hash => ({ hash, timestamp: Date.now() }));
      const result = await this.compareVectors(peerVector);
      return { missingHashes: result.missingHashes };
    } catch (error) {
      console.error('[GossipEngine] Failed to compare with peer:', error);
      return { missingHashes: [] };
    }
  }

  /**
   * relayMessage(msg): Marks message for epidemic propagation
   * When a message is received from a peer, it is marked as 'Pending-Relay'
   * until it is sent to at least one other distinct peer
   * 
   * @param {Object} msg - Message to relay
   * @param {string} sourcePeerId - Peer who sent us this message
   * @returns {Promise<Object>} Updated message with relay status
   */
  async relayMessage(msg, sourcePeerId) {
    try {
      // Mark message as pending relay
      const relayMetadata = {
        relayStatus: 'pending',
        relayedAt: Date.now(),
        sourcePeerId: sourcePeerId,
        relayCount: 0,
        relayedToPeers: []
      };

      // Update message with relay metadata
      const messageToStore = {
        ...msg,
        metadata: {
          ...msg.metadata,
          ...relayMetadata
        }
      };

      // Store in Dexie
      await db.messages.put(messageToStore);
      
      console.log(`[GossipEngine:Relay] Message ${msg.id} marked for relay from ${sourcePeerId}`);
      
      return { success: true, message: messageToStore };
    } catch (error) {
      console.error('[GossipEngine:Relay] Failed to mark message for relay:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * markRelayed(msgId, targetPeerId): Marks message as successfully relayed to a peer
   * 
   * @param {string} msgId - Message ID
   * @param {string} targetPeerId - Peer we relayed to
   * @returns {Promise<boolean>} True if message is now fully relayed (sent to at least one peer)
   */
  async markRelayed(msgId, targetPeerId) {
    try {
      const msg = await db.messages.get(msgId);
      if (!msg) return false;

      const relayedToPeers = msg.metadata?.relayedToPeers || [];
      
      // Add this peer to relayed list if not already there
      if (!relayedToPeers.includes(targetPeerId)) {
        relayedToPeers.push(targetPeerId);
      }

      const relayCount = relayedToPeers.length;
      const isFullyRelayed = relayCount >= 1; // Epidemic spread: at least one peer

      // Update message
      await db.messages.update(msgId, {
        metadata: {
          ...msg.metadata,
          relayStatus: isFullyRelayed ? 'relayed' : 'pending',
          relayCount: relayCount,
          relayedToPeers: relayedToPeers
        }
      });

      console.log(`[GossipEngine:Relay] Message ${msgId} relayed to ${targetPeerId} (total: ${relayCount}, status: ${isFullyRelayed ? 'relayed' : 'pending'})`);
      
      return isFullyRelayed;
    } catch (error) {
      console.error('[GossipEngine:Relay] Failed to mark relayed:', error);
      return false;
    }
  }

  /**
   * getPendingRelayMessages(): Returns messages that need to be relayed
   * Used by the mesh node to find messages to propagate
   * 
   * @returns {Promise<Array>} List of messages pending relay
   */
  async getPendingRelayMessages() {
    try {
      const pendingMessages = await db.messages
        .filter(msg => msg.metadata?.relayStatus === 'pending')
        .toArray();
      
      return pendingMessages;
    } catch (error) {
      console.error('[GossipEngine:Relay] Failed to get pending relay messages:', error);
      return [];
    }
  }

  /**
   * detectUnpropagatedMessages(): Detects messages with is_propagated: false
   * These are newly ingested QR drops that need to be broadcast
   * 
   * @returns {Promise<Array>} List of unpropagated messages
   */
  async detectUnpropagatedMessages() {
    try {
      const unpropagatedMessages = await db.messages
        .filter(msg => msg.is_propagated === false)
        .toArray();
      
      if (unpropagatedMessages.length > 0) {
        console.log(`[GossipEngine] Detected ${unpropagatedMessages.length} unpropagated messages (QR drops)`);
      }
      
      return unpropagatedMessages;
    } catch (error) {
      console.error('[GossipEngine] Failed to detect unpropagated messages:', error);
      return [];
    }
  }

  /**
   * markMessageForPropagation(msgId): Marks a message for propagation
   * Sets is_propagated: true and relayStatus: 'pending'
   * 
   * @param {string} msgId - Message ID to mark
   * @returns {Promise<boolean>} Success status
   */
  async markMessageForPropagation(msgId) {
    try {
      await db.messages.update(msgId, {
        is_propagated: true,
        metadata: {
          relayStatus: 'pending',
          relayCount: 0,
          relayedToPeers: []
        }
      });
      
      console.log(`[GossipEngine] Marked message ${msgId} for propagation`);
      return true;
    } catch (error) {
      console.error('[GossipEngine] Failed to mark message for propagation:', error);
      return false;
    }
  }

  /**
   * autoPropagateUnpropagatedMessages(): Automatically propagates unpropagated messages
   * Called when a new Bluetooth peer is discovered
   * 
   * @param {string} peerId - Peer ID to propagate to
   * @returns {Promise<{propagated: number, failed: number}>}
   */
  async autoPropagateUnpropagatedMessages(peerId) {
    try {
      const unpropagatedMessages = await this.detectUnpropagatedMessages();
      
      if (unpropagatedMessages.length === 0) {
        return { propagated: 0, failed: 0 };
      }

      console.log(`[GossipEngine] Auto-propagating ${unpropagatedMessages.length} messages to peer ${peerId}`);

      let propagated = 0;
      let failed = 0;

      for (const msg of unpropagatedMessages) {
        try {
          // Mark for propagation
          await this.markMessageForPropagation(msg.id);
          
          // Relay to peer
          await this.relayMessage(msg, peerId);
          
          propagated++;
        } catch (error) {
          console.error(`[GossipEngine] Failed to propagate message ${msg.id}:`, error);
          failed++;
        }
      }

      console.log(`[GossipEngine] Auto-propagation complete: ${propagated} propagated, ${failed} failed`);

      return { propagated, failed };
    } catch (error) {
      console.error('[GossipEngine] Auto-propagation failed:', error);
      return { propagated: 0, failed: 0 };
    }
  }

  /**
   * sendHandshake(): Broadcasts current VersionVector to connected peers
   * Step 1 of GossipSyncProtocol handshake
   * Now uses routerService.routeMessage() for random walk propagation
   * 
   * @param {Object} transport - Transport interface for sending
   * @param {string[]} peerIds - List of peer IDs to send handshake to
   * @returns {Promise<{success: boolean, sentTo: number}>}
   */
  async sendHandshake(transport, peerIds = []) {
    try {
      // Generate current VersionVector
      const versionVector = await this._generateVersionVector();
      
      console.log(`[GossipSyncProtocol] Broadcasting VersionVector to ${peerIds.length} peers`);
      
      // Create message object with TTL and hop counter
      const message = {
        type: 'GOSSIP_HANDSHAKE',
        versionVector,
        timestamp: Date.now(),
        ttl: routerService.getDefaultTTL(),
        hopCount: 0
      };

      // Convert peerIds to neighbor objects
      const neighbors = peerIds.map(peerId => ({ id: peerId }));

      // Use routerService for random walk propagation
      const result = await routerService.routeMessage(message, neighbors);

      return { success: result.success, sentTo: result.forwardedCount };
    } catch (error) {
      console.error('[GossipSyncProtocol] Handshake failed:', error);
      return { success: false, sentTo: 0 };
    }
  }

  /**
   * _generateVersionVector(): Generates current VersionVector from local messages
   * Returns mapping of { peer_id: counter } based on vector_clock
   * Enhanced to handle all message types (news, route, dm, drop)
   * @private
   * @returns {Promise<VersionVector>}
   */
  async _generateVersionVector() {
    const versionVector = {};
    
    try {
      // Get all messages with vector clocks
      const messages = await db.messages
        .filter(msg => msg.vectorClock !== undefined && msg.authorId)
        .toArray();
      
      // Build version vector: track max vector clock per author
      // Also track message types for type-specific sync
      for (const msg of messages) {
        const authorId = msg.authorId;
        const clock = msg.vectorClock || 0;
        const type = msg.type || 'news';
        
        if (!versionVector[authorId]) {
          versionVector[authorId] = {
            maxClock: clock,
            types: new Set([type])
          };
        } else {
          if (clock > versionVector[authorId].maxClock) {
            versionVector[authorId].maxClock = clock;
          }
          versionVector[authorId].types.add(type);
        }
      }
      
      // Convert Sets to Arrays for serialization
      for (const authorId in versionVector) {
        versionVector[authorId].types = Array.from(versionVector[authorId].types);
      }
      
      return versionVector;
    } catch (error) {
      console.error('[GossipSyncProtocol] Failed to generate VersionVector:', error);
      return {};
    }
  }

  /**
   * computeDelta(remoteVector): Compare local VersionVector vs remoteVector
   * Step 2 of GossipSyncProtocol - Diff Calculation
   * Identifies missing message IDs that remote peer has but local node is missing
   * Enhanced to handle all message types (news, route, dm, drop)
   * 
   * @param {VersionVector} remoteVector - Remote peer's VersionVector
   * @returns {Promise<{missingIds: string[], ourVersionVector: VersionVector}>}
   */
  async computeDelta(remoteVector) {
    try {
      const localVector = await this._generateVersionVector();
      const missingIds = [];
      
      // For each peer in remote vector, check if we have all their messages
      for (const [peerId, remoteData] of Object.entries(remoteVector)) {
        const localData = localVector[peerId];
        const remoteCounter = remoteData.maxClock || 0;
        const localCounter = localData?.maxClock || 0;
        
        // If remote has higher counter, we're missing messages
        if (remoteCounter > localCounter) {
          // Find messages from this peer with vector clock > localCounter
          const missingMessages = await db.messages
            .where('authorId')
            .equals(peerId)
            .and(msg => (msg.vectorClock || 0) > localCounter)
            .toArray();
          
          missingIds.push(...missingMessages.map(msg => msg.id));
        }
        
        // Check for missing message types
        if (localData && remoteData.types) {
          const missingTypes = remoteData.types.filter(type => !localData.types.includes(type));
          if (missingTypes.length > 0) {
            // Find messages of missing types from this peer
            const missingTypeMessages = await db.messages
              .where('authorId')
              .equals(peerId)
              .and(msg => missingTypes.includes(msg.type || 'news'))
              .toArray();
            
            missingIds.push(...missingTypeMessages.map(msg => msg.id));
          }
        }
      }
      
      console.log(`[GossipSyncProtocol] Delta computed: ${missingIds.length} missing IDs`);
      
      return { missingIds, ourVersionVector: localVector };
    } catch (error) {
      console.error('[GossipSyncProtocol] Delta computation failed:', error);
      return { missingIds: [], ourVersionVector: {} };
    }
  }

  /**
   * validateAndStore(message): Security middleware for signature verification
   * Critical Security Layer - validates before writing to IndexedDB
   * 
   * @param {Object} message - Message to validate and store
   * @param {string} peerId - Peer who sent this message
   * @returns {Promise<{success: boolean, stored: boolean, blacklisted: boolean}>}
   */
  async validateAndStore(message, peerId) {
    // Check if peer is blacklisted
    if (this._isPeerBlacklisted(peerId)) {
      console.warn(`[GossipSyncProtocol] Peer ${peerId} is blacklisted, dropping message`);
      return { success: false, stored: false, blacklisted: true };
    }

    try {
      // Ensure crypto service is initialized
      if (!cryptoService.isReady()) {
        await cryptoService.initialize();
      }

      // Verify signature
      const isValid = await cryptoService.verifyMessage(
        message.payload || message.content,
        message.signature,
        message.authorId || message.publicKey
      );

      if (!isValid) {
        console.error(`[GossipSyncProtocol] Signature verification failed for message from ${peerId}`);
        
        // Blacklist peer for 5 minutes
        this._blacklistPeer(peerId, 5 * 60 * 1000);
        
        return { success: false, stored: false, blacklisted: true };
      }

      // Signature verified - check if message already exists (idempotency)
      const existing = await db.messages.get(message.id);
      if (existing) {
        console.log(`[GossipSyncProtocol] Message ${message.id} already exists, skipping (idempotent)`);
        return { success: true, stored: false, blacklisted: false };
      }

      // Store in Dexie
      await db.messages.put(message);
      console.log(`[GossipSyncProtocol] Message ${message.id} validated and stored`);

      // Trigger UI update event
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('mesh:message_stored', {
          detail: { messageId: message.id, peerId, timestamp: Date.now() }
        }));
      }

      return { success: true, stored: true, blacklisted: false };
    } catch (error) {
      console.error('[GossipSyncProtocol] Validation and storage failed:', error);
      return { success: false, stored: false, blacklisted: false };
    }
  }

  /**
   * _isPeerBlacklisted(): Check if peer is currently blacklisted
   * @private
   * @param {string} peerId - Peer ID to check
   * @returns {boolean}
   */
  _isPeerBlacklisted(peerId) {
    const blacklistEntry = peerBlacklist.get(peerId);
    if (!blacklistEntry) return false;
    
    // Check if blacklist has expired
    if (Date.now() > blacklistEntry.expiresAt) {
      peerBlacklist.delete(peerId);
      return false;
    }
    
    return true;
  }

  /**
   * _blacklistPeer(): Blacklist a peer for a specified duration
   * @private
   * @param {string} peerId - Peer ID to blacklist
   * @param {number} duration - Duration in milliseconds
   */
  _blacklistPeer(peerId, duration) {
    const expiresAt = Date.now() + duration;
    peerBlacklist.set(peerId, {
      blacklistedAt: Date.now(),
      expiresAt
    });
    console.warn(`[GossipSyncProtocol] Blacklisted peer ${peerId} for ${duration}ms`);
    
    // Auto-cleanup after expiration
    setTimeout(() => {
      peerBlacklist.delete(peerId);
      console.log(`[GossipSyncProtocol] Removed ${peerId} from blacklist`);
    }, duration);
  }

  /**
   * processSyncPayload(): Store incoming missing messages
   * Modified to use validateAndStore() for security middleware
   * Modified to prioritize 'physical_drop' messages and track propagation
   * @param {string} peerId 
   * @param {any[]} payloads 
   */
  async processSyncPayload(peerId, payloads) {
    this._logStatus(peerId, `Processing ${payloads.length} incoming payloads...`);

    let storedCount = 0;
    let rejectedCount = 0;
    try {
      for (const msg of payloads) {
        // VALIDATION MIDDLEWARE: Verify signature before storing
        const validation = await this.validateAndStore(msg, peerId);
        
        if (validation.blacklisted) {
          console.error(`[GossipEngine] Peer ${peerId} blacklisted due to failed verification`);
          rejectedCount++;
          break; // Stop processing from this peer
        }
        
        if (!validation.success) {
          rejectedCount++;
          continue;
        }
        
        if (!validation.stored) {
          // Message already exists (idempotent)
          continue;
        }
        
        storedCount++;
        
        // PRIORITY: If message is from a physical drop, ensure it's marked for propagation
        if (msg.metadata?.source === 'physical_drop') {
          msg.is_propagated = true;
          console.log(`[GossipEngine] Prioritizing physical drop message: ${msg.id}`);
        }

        // RELAY LOGIC: Mark received messages for epidemic propagation
        // Only if not already relayed and not from ourselves
        if (msg.authorId !== cryptoService.getPublicKey() && msg.metadata?.relayStatus !== 'relayed') {
          await this.relayMessage(msg, peerId);
        }
      }
      
      this._logStatus(peerId, `Sync complete. Stored: ${storedCount}, Rejected: ${rejectedCount}`, 'success');
      
      // Dispatch global sync event for UI reactivity
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('mesh:sync_complete', { 
          detail: { peerId, count: storedCount, rejected: rejectedCount, timestamp: Date.now() } 
        }));
      }

      return { success: true, stored: storedCount, rejected: rejectedCount };
    } catch (error) {
      this._logStatus(peerId, `Sync processing failed: ${error.message}`, 'error');
      return { success: false, error: error.message, stored: storedCount, rejected: rejectedCount };
    }
  }

  /**
   * initiateSync(peerNode): Atomic Sync Pipeline for Epidemic Sync Protocol
   * Handshake -> Negotiate -> Stream -> Write with atomic transactions
   * 
   * @param {Object} peerNode - Peer node object with id and transport
   * @returns {Promise<{success: boolean, messagesSynced: number, error?: string}>}
   */
  async initiateSync(peerNode) {
    const peerId = peerNode.id || peerNode.peerId;
    
    // Check if peer is blacklisted
    if (this._isPeerBlacklisted(peerId)) {
      console.warn(`[GossipEngine] Peer ${peerId} is blacklisted, skipping sync`);
      return { success: false, messagesSynced: 0, error: 'Peer is blacklisted' };
    }

    try {
      console.log(`[GossipEngine] Initiating sync with ${peerId}`);

      // Step 1: Handshake - Send local vector, receive remote vector
      const localVector = await this.generateSummaryVector({ useBloomFilter: true });
      
      // In a real implementation, this would exchange vectors over the transport
      // For now, we simulate receiving the remote vector
      const remoteVector = await this._exchangeVectors(peerNode, localVector);
      
      if (!remoteVector) {
        throw new Error('Failed to exchange vectors with peer');
      }

      console.log(`[GossipEngine] Handshake complete: local=${localVector.count}, remote=${remoteVector.count}`);

      // Step 2: Negotiate - Call computeDelta() to get missing IDs
      const delta = await this.computeDelta(remoteVector.vector);
      
      console.log(`[GossipEngine] Delta calculated: missingFromLocal=${delta.missingFromLocal.length}, missingFromRemote=${delta.missingFromRemote.length}`);

      // Step 3: Stream - Fetch full payloads for missing_ids from Dexie
      const payloadsToReceive = delta.missingFromLocal;
      const payloadsToSend = delta.missingFromRemote;

      let messagesSynced = 0;

      // Step 4: Write - Use atomic transaction to write received payloads
      if (payloadsToReceive.length > 0) {
        const received = await this._receivePayloads(peerId, payloadsToReceive);
        messagesSynced += received;
      }

      // Send our missing payloads to peer
      if (payloadsToSend.length > 0) {
        await this._sendPayloads(peerId, payloadsToSend);
      }

      console.log(`[GossipEngine] Sync complete: ${messagesSynced} messages synced`);

      return { success: true, messagesSynced };
    } catch (error) {
      console.error(`[GossipEngine] Sync failed with ${peerId}:`, error);
      return { success: false, messagesSynced: 0, error: error.message };
    }
  }

  /**
   * _exchangeVectors(): Exchange summary vectors with peer
   * @private
   */
  async _exchangeVectors(peerNode, localVector) {
    // In a real implementation, this would send localVector and await remoteVector
    // For now, return a simulated remote vector
    // This would be replaced with actual transport layer communication
    return {
      vector: [], // Would be populated by actual exchange
      count: 0,
      usingBloomFilter: false
    };
  }

  /**
   * _receivePayloads(): Receive payloads from peer with security verification
   * @private
   */
  async _receivePayloads(peerId, missingIds) {
    let synced = 0;

    // Use atomic transaction to ensure database consistency
    await db.transaction('rw', db.messages, async () => {
      for (const id of missingIds) {
        try {
          // Fetch payload from peer (simulated)
          const payload = await this._fetchPayloadFromPeer(peerId, id);
          
          if (!payload) {
            console.warn(`[GossipEngine] Failed to fetch payload ${id} from peer`);
            continue;
          }

          // Security Hook: Verify signature before committing
          const isValid = await this._verifyMessageSignature(payload, peerId);
          
          if (!isValid) {
            console.error(`[GossipEngine] Signature verification failed for message ${id} from peer ${peerId}`);
            
            // Blacklist peer on verification failure
            this._blacklistPeer(peerId, 'Signature verification failed');
            
            // Abort transaction
            throw new Error(`Signature verification failed for message ${id}`);
          }

          // Write to database
          await db.messages.put(payload);
          synced++;
          
          console.log(`[GossipEngine] Received and stored message ${id}`);
        } catch (error) {
          console.error(`[GossipEngine] Failed to receive message ${id}:`, error);
          // Continue with next message instead of aborting entire sync
        }
      }
    });

    return synced;
  }

  /**
   * _sendPayloads(): Send payloads to peer
   * @private
   */
  async _sendPayloads(peerId, missingIds) {
    for (const id of missingIds) {
      try {
        // Fetch from local database
        const message = await db.messages.get(id);
        
        if (!message) {
          console.warn(`[GossipEngine] Message ${id} not found locally`);
          continue;
        }

        // Send to peer (simulated)
        await this._sendPayloadToPeer(peerId, message);
        
        console.log(`[GossipEngine] Sent message ${id} to peer`);
      } catch (error) {
        console.error(`[GossipEngine] Failed to send message ${id}:`, error);
      }
    }
  }

  /**
   * _fetchPayloadFromPeer(): Fetch payload from peer
   * @private
   */
  async _fetchPayloadFromPeer(peerId, messageId) {
    // In a real implementation, this would fetch from the peer over the transport
    // For now, return null (simulated)
    return null;
  }

  /**
   * _sendPayloadToPeer(): Send payload to peer
   * @private
   */
  async _sendPayloadToPeer(peerId, payload) {
    // In a real implementation, this would send to the peer over the transport
    // For now, do nothing (simulated)
  }

  /**
   * _verifyMessageSignature(): Security hook for signature verification
   * @private
   */
  async _verifyMessageSignature(payload, peerId) {
    try {
      // Ensure crypto service is initialized
      if (!cryptoService.isReady()) {
        await cryptoService.initialize();
      }

      // Verify signature using crypto.verifyMessage()
      const isValid = await cryptoService.verifyMessage(
        payload,
        payload.signature,
        payload.authorId
      );

      return isValid;
    } catch (error) {
      console.error('[GossipEngine] Signature verification error:', error);
      return false;
    }
  }

  /**
   * _blacklistPeer(): Blacklist a peer for security violations
   * @private
   */
  _blacklistPeer(peerId, reason) {
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    peerBlacklist.set(peerId, {
      blacklistedAt: Date.now(),
      expiresAt,
      reason
    });
    console.warn(`[GossipEngine] Blacklisted peer ${peerId}: ${reason}`);
  }

  /**
   * _isPeerBlacklisted(): Check if peer is blacklisted
   * @private
   */
  _isPeerBlacklisted(peerId) {
    const entry = peerBlacklist.get(peerId);
    
    if (!entry) {
      return false;
    }

    // Check if blacklist has expired
    if (Date.now() > entry.expiresAt) {
      peerBlacklist.delete(peerId);
      console.log(`[GossipEngine] Blacklist expired for peer ${peerId}`);
      return false;
    }

    return true;
  }

  /**
   * initiateSyncFlow(peerId, transport) - Non-blocking sync orchestration
   */
  async initiateSyncFlow(peerId, transport) {
    // Non-blocking sync orchestration
    (async () => {
      try {
        console.log(`[GossipEngine:Sync] Starting sync flow with ${peerId}`);
        
        // 1. Generate local summary
        const ourSummary = await this.generateSummary();
        
        // 2. Log status to UI (placeholder for actual UI notification system)
        this._notifySyncStatus(peerId, 'Sync started: exchanging summaries');

        // 3. Exchange summaries (This part depends on the transport layer implementation)
        // In a real flow, we'd send ourSummary and await the peer's summary
        // For this architecture phase, we assume the handshake provides the peerSummary
        
        // 4. Request payloads if missing data is identified in compareWithPeer
        // This is handled by the transport/meshNode which calls processSyncPayload
        
        this._notifySyncStatus(peerId, 'Sync in progress: identifying missing data');
      } catch (error) {
        console.error(`[GossipEngine:Sync] Flow failed for ${peerId}:`, error);
        this._notifySyncStatus(peerId, `Sync failed: ${error.message}`, 'error');
      }
    })();
  }

  /**
   * Notify UI of sync status
   * @private
   */
  _notifySyncStatus(peerId, message, type = 'info') {
    // This would typically emit an event or update a global state
    console.log(`[GossipEngine:UI] ${peerId} -> ${message} (${type})`);
    
    // If meshNode has a status listener, we trigger it
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('mesh:sync_status', { 
        detail: { peerId, message, type, timestamp: Date.now() } 
      }));
    }
  }

  /**
   * Sort hashes by timestamp (oldest first)
   * @private
   */
  async _sortHashesByTimestamp(hashes) {
    if (hashes.length === 0) return [];

    const entries = await db.messageHashes
      .where('id')
      .anyOf(hashes)
      .toArray();

    const entryMap = new Map(entries.map(e => [e.id, e]));

    return hashes.sort((a, b) => {
      const timeA = entryMap.get(a)?.timestamp || 0;
      const timeB = entryMap.get(b)?.timestamp || 0;
      return timeA - timeB;
    });
  }

  /**
   * Generate unique session ID
   * @private
   */
  _generateSessionId() {
    return `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const gossipEngine = new GossipEngine();

// Named exports for testing
export { GossipEngine };
export default gossipEngine;
