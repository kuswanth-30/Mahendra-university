/**
 * Router Service - Random Walk Propagation for Mesh Routing
 * 
 * Implements random walk routing strategy for efficient message propagation
 * in mesh networks. Messages are forwarded to a random subset of neighbors
 * to reduce network congestion while maintaining coverage.
 * Now includes geospatial filtering to respect message radius.
 */

import { transportManager } from './transportManager.js';
import { geospatialService } from './geospatial.js';

/**
 * Router Service class
 */
class RouterService {
  constructor() {
    this.k = 2; // Configuration constant: number of neighbors to forward to
    this.defaultTTL = 10; // Default Time-to-Live for messages
    this.hopCounters = new Map(); // messageId -> hop count (for debugging)
  }

  /**
   * getRandomSubset(neighbors, k): Select k random neighbors from the list
   * Uses Fisher-Yates shuffle algorithm for unbiased random selection
   * 
   * @param {Array} neighbors - Array of neighbor objects
   * @param {number} k - Number of neighbors to select
   * @returns {Array} Random subset of neighbors
   */
  getRandomSubset(neighbors, k) {
    if (!Array.isArray(neighbors) || neighbors.length === 0) {
      return [];
    }

    if (k >= neighbors.length) {
      return [...neighbors]; // Return all if k >= total count
    }

    // Fisher-Yates shuffle for unbiased random selection
    const shuffled = [...neighbors];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Return first k elements
    return shuffled.slice(0, k);
  }

  /**
   * routeMessage(message): Route message to random subset of neighbors
   * Implements random walk propagation with TTL and hop counter
   * Now includes geospatial filtering to respect message radius
   * 
   * @param {Object} message - Message object with content, ttl, hopCount, lat, long, radius
   * @param {Array} neighbors - Array of neighbor objects
   * @returns {Promise<{success: boolean, forwardedCount: number, error?: string}>}
   */
  async routeMessage(message, neighbors) {
    try {
      // Check TTL
      if (message.ttl === undefined) {
        message.ttl = this.defaultTTL;
      }

      if (message.ttl <= 0) {
        console.log('[Router] TTL expired, stopping propagation');
        return { success: true, forwardedCount: 0 };
      }

      // Geospatial filtering: Check if current node is within message radius
      if (message.lat !== undefined && message.long !== undefined && message.radius !== undefined) {
        const isWithinRadius = geospatialService.isWithinRadius(
          message.lat,
          message.long,
          message.radius
        );

        if (!isWithinRadius) {
          console.log('[Router] Current node outside message radius, stopping propagation');
          return { success: true, forwardedCount: 0 };
        }
      }

      // Initialize hop counter if not present
      if (message.hopCount === undefined) {
        message.hopCount = 0;
      }

      // Increment hop counter
      message.hopCount++;
      this.hopCounters.set(message.id || message.hash, message.hopCount);

      console.log(`[Router] Routing message (hop: ${message.hopCount}, ttl: ${message.ttl})`);

      // Get random subset of neighbors
      const selectedNeighbors = this.getRandomSubset(neighbors, this.k);

      if (selectedNeighbors.length === 0) {
        console.log('[Router] No neighbors to forward to');
        return { success: true, forwardedCount: 0 };
      }

      // Decrement TTL before forwarding
      message.ttl--;

      // Forward to selected neighbors (non-blocking)
      const forwardPromises = selectedNeighbors.map(async (neighbor) => {
        try {
          // Encode message for transport
          const messageBuffer = this._encodeMessage(message);
          
          // Send via transport manager
          const result = await transportManager.sendData(neighbor.id, messageBuffer);
          
          if (result.success) {
            console.log(`[Router] Forwarded to neighbor: ${neighbor.id}`);
          } else {
            console.warn(`[Router] Failed to forward to ${neighbor.id}: ${result.error}`);
          }
          
          return result.success;
        } catch (error) {
          console.error(`[Router] Error forwarding to ${neighbor.id}:`, error);
          return false;
        }
      });

      // Wait for all forwards to complete (or fail)
      const results = await Promise.allSettled(forwardPromises);
      const forwardedCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

      console.log(`[Router] Forwarded to ${forwardedCount}/${selectedNeighbors.length} neighbors`);

      return {
        success: true,
        forwardedCount
      };
    } catch (error) {
      console.error('[Router] Route message failed:', error);
      return {
        success: false,
        forwardedCount: 0,
        error: error.message
      };
    }
  }

  /**
   * _encodeMessage(message): Encode message for transport
   * @private
   */
  _encodeMessage(message) {
    const jsonString = JSON.stringify(message);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString);
  }

  /**
   * setK(k): Set the subset size constant
   * @param {number} k - Number of neighbors to forward to
   */
  setK(k) {
    if (k > 0) {
      this.k = k;
      console.log(`[Router] Subset size set to: ${k}`);
    }
  }

  /**
   * getK(): Get the current subset size constant
   * @returns {number}
   */
  getK() {
    return this.k;
  }

  /**
   * setDefaultTTL(ttl): Set the default TTL for messages
   * @param {number} ttl - Default Time-to-Live
   */
  setDefaultTTL(ttl) {
    if (ttl > 0) {
      this.defaultTTL = ttl;
      console.log(`[Router] Default TTL set to: ${ttl}`);
    }
  }

  /**
   * getDefaultTTL(): Get the current default TTL
   * @returns {number}
   */
  getDefaultTTL() {
    return this.defaultTTL;
  }

  /**
   * getHopCount(messageId): Get hop count for a message (debugging)
   * @param {string} messageId - Message ID or hash
   * @returns {number|undefined} Hop count
   */
  getHopCount(messageId) {
    return this.hopCounters.get(messageId);
  }

  /**
   * getAllHopCounters(): Get all hop counters (debugging)
   * @returns {Map} Map of messageId -> hop count
   */
  getAllHopCounters() {
    return this.hopCounters;
  }

  /**
   * clearHopCounters(): Clear all hop counters
   */
  clearHopCounters() {
    this.hopCounters.clear();
  }
}

// Export singleton instance
export const routerService = new RouterService();
export default routerService;
