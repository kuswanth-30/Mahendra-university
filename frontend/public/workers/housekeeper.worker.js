/**
 * Housekeeper Worker - Background Message Cleanup
 * 
 * Runs every hour to delete messages older than the configured TTL,
 * except for messages marked as pinned.
 */

import { db } from '../../lib/db';
// Note: In a worker, we usually need to import config differently or pass it in
// For now we'll use the default values but they can be overridden via message

let intervalId = null;

/**
 * Perform the cleanup operation
 * @param {number} ttl - TTL in milliseconds
 */
async function performCleanup(ttl) {
  const expirationThreshold = Date.now() - ttl;
  
  console.log(`[Housekeeper Worker] Starting cleanup. Threshold: ${new Date(expirationThreshold).toISOString()}`);
  
  try {
    // Query messages:
    // 1. timestamp below threshold
    // 2. filter out is_pinned: true
    const deletedCount = await db.messages
      .where('timestamp')
      .below(expirationThreshold)
      .filter(msg => !msg.is_pinned)
      .delete();

    // Also clean up gossip tables to keep DB size small
    await db.messageHashes
      .where('timestamp')
      .below(expirationThreshold)
      .delete();
      
    await db.messageBlobs
      .where('createdAt')
      .below(expirationThreshold)
      .delete();

    self.postMessage({ 
      type: 'CLEANUP_COMPLETE', 
      deletedCount, 
      timestamp: Date.now() 
    });
    
    console.log(`[Housekeeper Worker] Cleanup complete. Deleted ${deletedCount} messages.`);
  } catch (error) {
    console.error('[Housekeeper Worker] Cleanup failed:', error);
    self.postMessage({ type: 'ERROR', error: error.message });
  }
}

// Listen for control messages
self.onmessage = (e) => {
  const { type, config } = e.data;

  if (type === 'START') {
    const ttl = config.MESSAGE_TTL || (48 * 60 * 60 * 1000);
    const interval = config.HOUSEKEEPER_INTERVAL || (60 * 60 * 1000);

    console.log(`[Housekeeper Worker] Service started. Interval: ${interval / 1000 / 60}m, TTL: ${ttl / 1000 / 60 / 60}h`);

    // Run immediately on start
    performCleanup(ttl);

    // Set up periodic run
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => performCleanup(ttl), interval);
  }

  if (type === 'STOP') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log('[Housekeeper Worker] Service stopped.');
  }

  if (type === 'RUN_NOW') {
    const ttl = config.MESSAGE_TTL || (48 * 60 * 60 * 1000);
    performCleanup(ttl);
  }
};
