/**
 * BeaconMesh Database Layer - Local-first storage with Dexie.js
 * 
 * Content-addressed storage using SHA-256 hashes as primary keys.
 * Ensures idempotency - duplicate messages are not stored.
 */

import Dexie from 'dexie';

/**
 * BeaconMesh Database Schema
 */
class BeaconMeshDB extends Dexie {
  constructor() {
    super('BeaconMeshDB');

    // Schema with hash as primary key
    this.version(1).stores({
      messages: 'hash, timestamp, vectorClock, content'
    });
  }

  /**
   * upsertMessage(msg): Idempotent message storage
   * Uses hash as primary key to prevent duplicates
   * 
   * @param {Object} msg - Message object with hash, content, timestamp, vectorClock
   * @returns {Promise<{success: boolean, action: 'inserted' | 'skipped', error?: string}>}
   */
  async upsertMessage(msg) {
    try {
      // Check if message already exists by hash
      const existing = await this.messages.get(msg.hash);

      if (existing) {
        console.log(`[BeaconMeshDB] Message already exists: ${msg.hash}`);
        return { success: true, action: 'skipped' };
      }

      // Insert new message
      await this.messages.put(msg);
      console.log(`[BeaconMeshDB] Inserted message: ${msg.hash}`);
      return { success: true, action: 'inserted' };
    } catch (error) {
      console.error('[BeaconMeshDB] Upsert failed:', error);
      return { success: false, action: 'skipped', error: error.message };
    }
  }

  /**
   * getAllMessages(): Get all messages sorted by timestamp
   * @returns {Promise<Array>}
   */
  async getAllMessages() {
    return await this.messages.orderBy('timestamp').toArray();
  }

  /**
   * getMessage(hash): Get message by hash
   * @param {string} hash - Message hash
   * @returns {Promise<Object|undefined>}
   */
  async getMessage(hash) {
    return await this.messages.get(hash);
  }

  /**
   * deleteMessage(hash): Delete message by hash
   * @param {string} hash - Message hash
   * @returns {Promise<void>}
   */
  async deleteMessage(hash) {
    await this.messages.delete(hash);
  }

  /**
   * clearAll(): Clear all messages
   * @returns {Promise<void>}
   */
  async clearAll() {
    await this.messages.clear();
  }
}

// Export singleton instance
export const db = new BeaconMeshDB();
export default db;
