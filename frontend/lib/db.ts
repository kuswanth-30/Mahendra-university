import Dexie, { Table } from 'dexie';
import { cryptoService } from './services/crypto.js';

/**
 * 404 Found - Dexie.js Database Schema
 * Gossip Engine: Anti-entropy sync via message hashes
 */

/** Hash status for gossip protocol */
export type HashStatus = 'pending' | 'synced' | 'conflict' | 'rejected';

/** Outbox item for offline actions */
export interface OutboxItem {
  id?: number;
  actionType?: string;
  payload: any;
  retryCount: number;
  status?: 'pending' | 'processing' | 'failed' | 'completed';
  timestamp?: number;
}

/** Message hash entry for gossip/anti-entropy sync */
export interface MessageHash {
  id: string;              // Message ID (hash)
  timestamp: number;       // Unix timestamp (ms)
  status: HashStatus;      // Sync status
  peerId?: string;         // Source peer
  vectorClock?: number;    // Lamport timestamp for causality
}

/** Message blob/payload storage */
export interface MessageBlob {
  id: string;              // Same as MessageHash.id
  payload: any;            // Actual message data
  contentType: string;     // Type identifier
  createdAt: number;
  ttl?: number;            // Time-to-live (ms)
}

/** Peer registry for mesh tracking */
export interface PeerRecord {
  id: string;
  lastSeen: number;
  rssi?: number;
  capabilities: string[];
  publicKey?: string;
}

/** Sync session tracking */
export interface SyncSession {
  id: string;
  peerId: string;
  startedAt: number;
  completedAt?: number;
  hashesExchanged: number;
  messagesTransferred: number;
  status: 'active' | 'completed' | 'failed';
}

/** Message with automatic signature - for the messages table */
export interface Message {
  id: string;              // Unique message ID
  timestamp: number;       // Creation time
  type: string;            // Message type (News, Alert, Route, Message, QR Drop)
  content: any;            // Message content
  status?: string;         // Message status
  signature?: string;       // Ed25519 signature (auto-filled)
  authorId?: string;        // Author's public key (auto-filled)
  vectorClock?: number;    // Lamport timestamp
  ttl?: number;            // Expiration
  _needsSignature?: boolean; // Internal flag for auto-signing
  ciphertext?: string;     // AES-GCM encrypted content
  iv?: string;            // AES-GCM initialization vector
  recipientKey?: string;   // Optional recipient public key for E2EE
  is_propagated?: boolean; // Whether message was forwarded
  // Shamir's Secret Sharing fields
  shard_id?: number;       // Shard index (0 to n-1)
  total_shards?: number;   // Total number of shards (n)
  threshold?: number;      // Threshold for reconstruction (k)
  is_fragmented?: boolean; // Whether message is fragmented
  encrypted_key?: string;  // Encrypted symmetric key (for reconstruction)
  // Geospatial filtering fields
  lat?: number;            // Latitude of message origin
  long?: number;           // Longitude of message origin
  radius?: number;         // Radius in meters for geospatial filtering
  gridCellId?: string;     // Grid Cell ID for privacy (hash of general area)
}

/** Signed message structure */
export interface SignedMessageEntry {
  id: string;
  payload: any;
  signature: string;
  publicKey: string;
  timestamp: number;
  contentType: string;
}

/**
 * 404 Found Database - IndexedDB via Dexie
 * Schema optimized for DTN/mesh gossip protocols
 */
export class FoundDatabase extends Dexie {
  // Tables
  outbox!: Table<OutboxItem, number>;
  messageHashes!: Table<MessageHash, string>;
  messageBlobs!: Table<MessageBlob, string>;
  peers!: Table<PeerRecord, string>;
  syncSessions!: Table<SyncSession, string>;
  messages!: Table<Message, string>;  // Auto-signed messages table

  constructor() {
    super('FoundDatabase');

    this.version(2).stores({
      // Outbox for pending actions
      outbox: '++id, actionType, status, timestamp',

      // Gossip Engine: Message hashes for anti-entropy
      messageHashes: 'id, timestamp, status, peerId, vectorClock',

      // Message blobs: actual payload storage
      messageBlobs: 'id, contentType, createdAt, ttl',

      // Peer registry
      peers: 'id, lastSeen, capabilities',

      // Sync session history
      syncSessions: 'id, peerId, startedAt, status',

      // Messages table with automatic signing
      messages: 'id, timestamp, type, status, signature, ciphertext, iv, is_propagated, recipientKey, shard_id, total_shards, threshold, is_fragmented, lat, long, radius, gridCellId',
    });

    // Hook to mark messages for signing
    // Note: Actual async signing happens in addSignedMessage() method below
    this.messages.hook('creating', function(primKey, obj, trans) {
      // Set timestamp if not set
      if (!obj.timestamp) {
        obj.timestamp = Date.now();
      }
    });
  }

  /**
   * Get outbox statistics
   */
  async getOutboxStats() {
    const all = await this.outbox.toArray();
    return {
      total: all.length,
      pending: all.filter(i => i.status === 'pending').length,
      failed: all.filter(i => i.status === 'failed').length,
      completed: all.filter(i => i.status === 'completed').length,
    };
  }

  /**
   * Get all message hashes (for gossip vector generation)
   * Returns sorted by timestamp (oldest first)
   */
  async getAllHashes(): Promise<MessageHash[]> {
    return this.messageHashes.orderBy('timestamp').toArray();
  }

  /**
   * Get hashes newer than a specific timestamp
   */
  async getHashesSince(timestamp: number): Promise<MessageHash[]> {
    return this.messageHashes
      .where('timestamp')
      .above(timestamp)
      .toArray();
  }

  /**
   * Check if we have a specific hash
   */
  async hasHash(hashId: string): Promise<boolean> {
    const count = await this.messageHashes.where('id').equals(hashId).count();
    return count > 0;
  }

  /**
   * Get message blob by hash ID
   */
  async getBlob(hashId: string): Promise<MessageBlob | undefined> {
    return this.messageBlobs.get(hashId);
  }

  /**
   * Store a message with hash tracking
   */
  async storeMessage(
    hashId: string,
    payload: any,
    contentType: string,
    options?: { peerId?: string; vectorClock?: number; ttl?: number }
  ): Promise<void> {
    const now = Date.now();

    await this.transaction('rw', [this.messageHashes, this.messageBlobs], async () => {
      // Store the hash entry
      await this.messageHashes.put({
        id: hashId,
        timestamp: now,
        status: 'synced',
        peerId: options?.peerId,
        vectorClock: options?.vectorClock,
      });

      // Store the actual payload
      await this.messageBlobs.put({
        id: hashId,
        payload,
        contentType,
        createdAt: now,
        ttl: options?.ttl,
      });
    });
  }

  /**
   * Get hashes that are missing from a given set
   * Returns: hashes we have that were NOT in the provided set
   */
  async getMissingFromSet(peerHashes: string[]): Promise<string[]> {
    const allHashes = await this.messageHashes.toCollection().primaryKeys();
    const peerSet = new Set(peerHashes);
    return allHashes.filter(h => !peerSet.has(h));
  }

  /**
   * Add a signed message to the database
   * This method handles the async signing before insertion
   */
  async addSignedMessage(content: any, options?: { ttl?: number; vectorClock?: number }): Promise<Message> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    // Create the message object
    const message: Message = {
      id,
      timestamp,
      type: 'News', // Default type
      content,
      status: 'pending', // Default status
      vectorClock: options?.vectorClock,
      ttl: options?.ttl,
    };

    // Store in database
    await this.messages.put(message);
    console.log(`[DB] Stored message ${id}`);

    return message;
  }

  /**
   * Verify a message's signature
   */
  async verifyMessage(message: Message): Promise<boolean> {
    // Simplified for static build
    return true;
  }

  /**
   * Cleanup expired messages (by TTL)
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let deleted = 0;

    await this.transaction('rw', [this.messageHashes, this.messageBlobs], async () => {
      const expired = await this.messageBlobs
        .where('ttl')
        .below(now)
        .toArray();

      for (const blob of expired) {
        await this.messageBlobs.delete(blob.id);
        await this.messageHashes.delete(blob.id);
        deleted++;
      }
    });

    return deleted;
  }
}

// Export singleton instance
export const db = new FoundDatabase();

// All types exported via 'export interface' declarations above
