/**
 * Sync Worker - Background Gossip Protocol Operations for 404 Found
 * 
 * Runs in separate thread to keep UI at 60fps
 * Handles: data vector generation, comparison, payload preparation/processing
 * 
 * Message Protocol:
 * - GENERATE_VECTOR: Generate data vector of all hashes
 * - COMPARE_VECTORS: Compare with peer vector to find missing data
 * - PREPARE_PAYLOADS: Fetch and sign payloads for requested hashes
 * - PROCESS_PAYLOADS: Verify and store incoming payloads
 * - CLEANUP_EXPIRED: Remove TTL-expired messages
 */

importScripts('/workers/idb-wrapper.js'); // Dexie in worker

// Simulated DB operations (real implementation would use Dexie or idb)
const mockDB = {
  hashes: new Map(),
  blobs: new Map(),
};

/**
 * Generate data vector - all message hashes we possess
 */
async function generateDataVector(options = {}) {
  const { since, limit = 1000 } = options;
  
  // In real implementation: await db.getAllHashes() or db.getHashesSince(since)
  const allHashes = Array.from(mockDB.hashes.values());
  
  let filtered = since 
    ? allHashes.filter(h => h.timestamp > since)
    : allHashes;
  
  filtered = filtered
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  
  return filtered.map(h => ({
    hash: h.id,
    timestamp: h.timestamp,
    vectorClock: h.vectorClock,
  }));
}

/**
 * Compare vectors - find what we're missing
 */
async function compareVectors(peerVector) {
  const peerHashes = new Set(peerVector.map(v => v.hash));
  const allOurHashes = Array.from(mockDB.hashes.keys());
  
  const missingHashes = [];
  const theirMissingHashes = [];
  
  // Find hashes we need (peer has, we don't)
  for (const entry of peerVector) {
    if (!mockDB.hashes.has(entry.hash)) {
      missingHashes.push(entry.hash);
    }
  }
  
  // Find hashes they need (we have, they don't)
  for (const hash of allOurHashes) {
    if (!peerHashes.has(hash)) {
      theirMissingHashes.push(hash);
    }
  }
  
  return {
    missingHashes,
    theirMissingHashes,
    summary: {
      peerHashCount: peerHashes.size,
      ourHashCount: allOurHashes.length,
      missingCount: missingHashes.length,
      theirMissingCount: theirMissingHashes.length,
    },
  };
}

/**
 * Prepare payloads - fetch and sign requested hashes
 */
async function preparePayloads(requestedHashes, options = {}) {
  const { chunkSize = 50, chunkIndex = 0, signMessages = true } = options;
  
  const start = chunkIndex * chunkSize;
  const end = start + chunkSize;
  const chunk = requestedHashes.slice(start, end);
  const hasMore = end < requestedHashes.length;
  
  const payloads = [];
  
  for (const hash of chunk) {
    const blob = mockDB.blobs.get(hash);
    const hashEntry = mockDB.hashes.get(hash);
    
    if (!blob) continue;
    
    let payloadEntry = {
      hash: blob.id,
      payload: blob.payload,
      contentType: blob.contentType,
      timestamp: blob.createdAt,
      vectorClock: hashEntry?.vectorClock,
      peerId: hashEntry?.peerId,
    };
    
    // Sign if enabled (would call crypto worker in real implementation)
    if (signMessages) {
      // Request signing from main thread or use inline crypto
      // For now, mark as needing signature
      payloadEntry._needsSignature = true;
    }
    
    payloads.push(payloadEntry);
  }
  
  return {
    payloads,
    hasMore,
    chunkIndex,
    totalRequested: requestedHashes.length,
  };
}

/**
 * Process payloads - verify and store incoming data
 */
async function processPayloads(payloads, peerId, options = {}) {
  const { verifySignatures = true } = options;
  
  let stored = 0;
  let conflicts = 0;
  let errors = 0;
  let rejected = 0;
  
  for (const entry of payloads) {
    try {
      // Verify signature if present
      if (verifySignatures && entry.payload && entry.payload.signature) {
        // Would verify via crypto worker
        // For now, simulate verification
        const isValid = true; // Replace with actual verification
        
        if (!isValid) {
          rejected++;
          continue;
        }
        
        // Extract actual payload
        entry.payload = entry.payload.payload;
      }
      
      // Check for existing (conflict detection)
      if (mockDB.hashes.has(entry.hash)) {
        const existing = mockDB.hashes.get(entry.hash);
        if (existing.vectorClock && entry.vectorClock) {
          if (entry.vectorClock > existing.vectorClock) {
            // Newer version - update
            mockDB.hashes.set(entry.hash, {
              id: entry.hash,
              timestamp: entry.timestamp,
              vectorClock: entry.vectorClock,
              peerId,
              status: 'synced',
            });
            mockDB.blobs.set(entry.hash, {
              id: entry.hash,
              payload: entry.payload,
              contentType: entry.contentType,
              createdAt: entry.timestamp,
            });
            stored++;
          } else {
            conflicts++;
          }
        } else {
          conflicts++;
        }
      } else {
        // New message
        mockDB.hashes.set(entry.hash, {
          id: entry.hash,
          timestamp: entry.timestamp,
          vectorClock: entry.vectorClock,
          peerId,
          status: 'synced',
        });
        mockDB.blobs.set(entry.hash, {
          id: entry.hash,
          payload: entry.payload,
          contentType: entry.contentType,
          createdAt: entry.timestamp,
        });
        stored++;
      }
    } catch (error) {
      errors++;
    }
  }
  
  return { stored, conflicts, errors, rejected };
}

/**
 * Cleanup expired messages
 */
async function cleanupExpired() {
  const now = Date.now();
  let deleted = 0;
  
  for (const [id, blob] of mockDB.blobs) {
    if (blob.ttl && blob.ttl < now) {
      mockDB.blobs.delete(id);
      mockDB.hashes.delete(id);
      deleted++;
    }
  }
  
  return { deleted };
}

/**
 * Get sync statistics
 */
async function getStats() {
  return {
    hashCount: mockDB.hashes.size,
    blobCount: mockDB.blobs.size,
    // Real implementation would track actual stats
  };
}

// Message handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  
  try {
    let result;
    
    switch (type) {
      case 'GENERATE_VECTOR':
        result = await generateDataVector(payload.options);
        break;
        
      case 'COMPARE_VECTORS':
        result = await compareVectors(payload.peerVector);
        break;
        
      case 'PREPARE_PAYLOADS':
        result = await preparePayloads(payload.hashes, payload.options);
        break;
        
      case 'PROCESS_PAYLOADS':
        result = await processPayloads(payload.payloads, payload.peerId, payload.options);
        break;
        
      case 'CLEANUP_EXPIRED':
        result = await cleanupExpired();
        break;
        
      case 'GET_STATS':
        result = await getStats();
        break;
        
      case 'BULK_STORE':
        // Bulk store from main thread
        for (const item of payload.hashes || []) {
          mockDB.hashes.set(item.id, item);
        }
        for (const item of payload.blobs || []) {
          mockDB.blobs.set(item.id, item);
        }
        result = { stored: payload.hashes?.length || 0 };
        break;
        
      default:
        result = { error: `Unknown command: ${type}` };
    }
    
    self.postMessage({ id, type, result, error: null });
  } catch (error) {
    self.postMessage({ id, type, result: null, error: error.message });
  }
};

// Signal ready
self.postMessage({ type: 'READY', result: { ready: true } });
