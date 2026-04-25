/**
 * DatabaseStore - Idempotent upsert logic for Dexie.js
 * 
 * Provides safe database operations with version-based conflict resolution:
 * - Schema with id as primary key and timestamp index
 * - upsertMessage(msg): Idempotent upsert with version comparison
 * - getMissingMessages(knownIds): Returns messages local DB has that peer doesn't
 * - All operations wrapped in Dexie transactions
 */

import Dexie, { Table } from 'dexie';

/**
 * Message interface for DatabaseStore
 */
export interface DBMessage {
  id: string;              // Primary key
  content: any;            // Message content
  timestamp: number;       // Unix timestamp (ms)
  version?: number;        // Version number for conflict resolution
  type?: string;           // Message type
  authorId?: string;       // Author's public key
  signature?: string;      // Ed25519 signature
  is_propagated?: boolean; // Propagation flag
  source?: string;         // Source (p2p, qr_drop, physical_drop)
  vectorClock?: number;    // Lamport timestamp
  ttl?: number;            // Time-to-live
  metadata?: any;          // Additional metadata
  is_pinned?: boolean;     // Pin flag to prevent deletion
}

/**
 * DatabaseStore class
 */
class DatabaseStore extends Dexie {
  messages!: Table<DBMessage, string>;
  private readonly MAX_MESSAGES = 500; // Bounded buffer threshold

  constructor() {
    super('FoundDatabaseStore');

    // Define schema with id as primary key and timestamp index
    this.version(1).stores({
      messages: 'id, timestamp, version, type, authorId, source, is_propagated, is_pinned'
    });
  }

  /**
   * upsertMessage(msg): Idempotent upsert with version comparison
   * Before inserting, query by id. If ID exists, compare versions or timestamps.
   * Only update if incoming data is "newer" or "more complete".
   * 
   * Bounded Buffer Policy: If count exceeds 500, delete oldest unpinned message.
   * 
   * @param {DBMessage} msg - Message to upsert
   * @returns {Promise<{success: boolean, action: 'inserted' | 'updated' | 'skipped', message?: string}>}
   */
  async upsertMessage(msg: DBMessage): Promise<{success: boolean, action: 'inserted' | 'updated' | 'skipped', message?: string}> {
    try {
      // Wrap in transaction to prevent data corruption
      return await this.transaction('rw', this.messages, async () => {
        // Query by id
        const existing = await this.messages.get(msg.id);

        if (!existing) {
          // Bounded Buffer Policy: Check if we need to make space
          await this._enforceBoundedBuffer();

          // Insert new message
          await this.messages.put(msg);
          console.log(`[DatabaseStore] Inserted new message: ${msg.id}`);
          return { success: true, action: 'inserted', message: 'Message inserted' };
        }

        // Compare versions or timestamps to determine if update is needed
        const shouldUpdate = this._shouldUpdate(existing, msg);

        if (!shouldUpdate) {
          console.log(`[DatabaseStore] Skipped stale message: ${msg.id}`);
          return { success: true, action: 'skipped', message: 'Message skipped (stale data)' };
        }

        // Update with newer data
        await this.messages.put(msg);
        console.log(`[DatabaseStore] Updated message: ${msg.id}`);
        return { success: true, action: 'updated', message: 'Message updated' };
      });
    } catch (error) {
      console.error('[DatabaseStore] Upsert failed:', error);
      return { success: false, action: 'skipped', message: error.message };
    }
  }

  /**
   * _enforceBoundedBuffer(): Drop Oldest policy
   * If count exceeds threshold (500), delete oldest unpinned message
   * @private
   */
  private async _enforceBoundedBuffer(): Promise<void> {
    const count = await this.messages.count();
    
    if (count >= this.MAX_MESSAGES) {
      console.log(`[DatabaseStore] Bounded buffer: ${count} messages, enforcing drop oldest policy`);
      
      // Find the oldest message
      const oldest = await this.messages.orderBy('timestamp').first();
      
      if (oldest && !oldest.is_pinned) {
        await this.messages.delete(oldest.id);
        console.log(`[DatabaseStore] Dropped oldest unpinned message: ${oldest.id}`);
      } else if (oldest && oldest.is_pinned) {
        // If oldest is pinned, try to find the next oldest unpinned
        const messages = await this.messages.orderBy('timestamp').toArray();
        const oldestUnpinned = messages.find(m => !m.is_pinned);
        
        if (oldestUnpinned) {
          await this.messages.delete(oldestUnpinned.id);
          console.log(`[DatabaseStore] Dropped oldest unpinned message: ${oldestUnpinned.id}`);
        } else {
          console.warn('[DatabaseStore] All messages are pinned, cannot drop any');
        }
      }
    }
  }

  /**
   * Determine if incoming message should update existing message
   * @private
   * @param {DBMessage} existing - Existing message
   * @param {DBMessage} incoming - Incoming message
   * @returns {boolean} True if incoming is newer
   */
  private _shouldUpdate(existing: DBMessage, incoming: DBMessage): boolean {
    // Compare version if both have version
    if (existing.version !== undefined && incoming.version !== undefined) {
      return incoming.version > existing.version;
    }

    // Compare vector clock if both have it
    if (existing.vectorClock !== undefined && incoming.vectorClock !== undefined) {
      return incoming.vectorClock > existing.vectorClock;
    }

    // Compare timestamp as fallback
    if (existing.timestamp !== undefined && incoming.timestamp !== undefined) {
      return incoming.timestamp > existing.timestamp;
    }

    // If no version/timestamp info, update to be safe
    return true;
  }

  /**
   * getMissingMessages(knownIds): Returns messages local DB has that peer doesn't
   * Useful for sync operations to identify messages to send to peer
   * 
   * @param {string[]} knownIds - List of message IDs known by peer
   * @returns {Promise<DBMessage[]>} Messages local DB has that peer doesn't
   */
  async getMissingMessages(knownIds: string[]): Promise<DBMessage[]> {
    try {
      // Wrap in transaction for consistency
      return await this.transaction('r', this.messages, async () => {
        // Get all messages
        const allMessages = await this.messages.toArray();

        // Filter out messages that peer already knows
        const missingMessages = allMessages.filter(msg => !knownIds.includes(msg.id));

        console.log(`[DatabaseStore] Found ${missingMessages.length} missing messages (known: ${knownIds.length}, total: ${allMessages.length})`);

        return missingMessages;
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get missing messages:', error);
      return [];
    }
  }

  /**
   * getMessagesByType(type): Get all messages of a specific type
   * 
   * @param {string} type - Message type
   * @returns {Promise<DBMessage[]>} Messages of specified type
   */
  async getMessagesByType(type: string): Promise<DBMessage[]> {
    try {
      return await this.transaction('r', this.messages, async () => {
        return await this.messages.where('type').equals(type).toArray();
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get messages by type:', error);
      return [];
    }
  }

  /**
   * getMessagesAfterTimestamp(timestamp): Get messages newer than timestamp
   * 
   * @param {number} timestamp - Timestamp threshold
   * @returns {Promise<DBMessage[]>} Messages newer than timestamp
   */
  async getMessagesAfterTimestamp(timestamp: number): Promise<DBMessage[]> {
    try {
      return await this.transaction('r', this.messages, async () => {
        return await this.messages.where('timestamp').above(timestamp).toArray();
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get messages after timestamp:', error);
      return [];
    }
  }

  /**
   * getUnpropagatedMessages(): Get messages that haven't been propagated yet
   * 
   * @returns {Promise<DBMessage[]>} Unpropagated messages
   */
  async getUnpropagatedMessages(): Promise<DBMessage[]> {
    try {
      return await this.transaction('r', this.messages, async () => {
        return await this.messages.filter(msg => msg.is_propagated === false).toArray();
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get unpropagated messages:', error);
      return [];
    }
  }

  /**
   * markPropagated(id): Mark a message as propagated
   * 
   * @param {string} id - Message ID
   * @returns {Promise<boolean>} Success status
   */
  async markPropagated(id: string): Promise<boolean> {
    try {
      await this.transaction('rw', this.messages, async () => {
        await this.messages.update(id, { is_propagated: true });
      });
      console.log(`[DatabaseStore] Marked message as propagated: ${id}`);
      return true;
    } catch (error) {
      console.error('[DatabaseStore] Failed to mark propagated:', error);
      return false;
    }
  }

  /**
   * deleteMessage(id): Delete a message by ID
   * 
   * @param {string} id - Message ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteMessage(id: string): Promise<boolean> {
    try {
      await this.transaction('rw', this.messages, async () => {
        await this.messages.delete(id);
      });
      console.log(`[DatabaseStore] Deleted message: ${id}`);
      return true;
    } catch (error) {
      console.error('[DatabaseStore] Failed to delete message:', error);
      return false;
    }
  }

  /**
   * getAllMessages(): Get all messages
   * 
   * @returns {Promise<DBMessage[]>} All messages
   */
  async getAllMessages(): Promise<DBMessage[]> {
    try {
      return await this.transaction('r', this.messages, async () => {
        return await this.messages.toArray();
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get all messages:', error);
      return [];
    }
  }

  /**
   * getMessageCount(): Get total message count
   * 
   * @returns {Promise<number>} Message count
   */
  async getMessageCount(): Promise<number> {
    try {
      return await this.transaction('r', this.messages, async () => {
        return await this.messages.count();
      });
    } catch (error) {
      console.error('[DatabaseStore] Failed to get message count:', error);
      return 0;
    }
  }

  /**
   * clearAllMessages(): Delete all messages
   * 
   * @returns {Promise<boolean>} Success status
   */
  async clearAllMessages(): Promise<boolean> {
    try {
      await this.transaction('rw', this.messages, async () => {
        await this.messages.clear();
      });
      console.log('[DatabaseStore] Cleared all messages');
      return true;
    } catch (error) {
      console.error('[DatabaseStore] Failed to clear messages:', error);
      return false;
    }
  }
}

// Export singleton instance
export const databaseStore = new DatabaseStore();
export default databaseStore;
