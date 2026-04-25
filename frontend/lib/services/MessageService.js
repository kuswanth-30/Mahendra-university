import { db } from '@/lib/db';
import { cryptoService } from './crypto.js';
import { shardingService } from './sharding.js';
import { securityService } from './securityService.js';
import { versioningService } from './versioning.js';

/**
 * Data Minimization Middleware
 * Strips sensitive PII and non-essential metadata before storage
 * 
 * @param {Object} message - Raw message object
 * @returns {Object} Sanitized message object
 */
export function sanitizeMetadata(message) {
  const essential = {
    id: message.id,
    timestamp: message.timestamp || Date.now(),
    type: message.type || 'News',
    signature: message.signature,
    authorId: message.authorId,
    // Keep essential mesh routing info
    vectorClock: message.vectorClock,
    ttl: message.ttl,
    is_propagated: message.is_propagated || false
  };

  // Strip non-essential/sensitive fields
  const sensitiveFields = ['ip_address', 'device_id', 'user_agent', 'location_precise', 'real_name'];
  
  if (message.content && typeof message.content === 'object') {
    const sanitizedContent = { ...message.content };
    sensitiveFields.forEach(field => delete sanitizedContent[field]);
    essential.content = sanitizedContent;
  } else {
    essential.content = message.content;
  }

  return essential;
}

class MessageService {
  /**
   * Saves a message to the mesh storage with E2EE, Data Minimization, and Session-based Disk Encryption.
   * 
   * Flow:
   * 1. Sanitize Metadata (Remove PII)
   * 2. Auto-compute SHA-256 ID if missing
   * 3. Pseudonymous ID generation (Hash of PK)
   * 4. If 'is_fragmented' is true, trigger sharding flow
   * 5. Encrypt Content (AES-GCM) with Session Key
   * 6. Sign Ciphertext (Ed25519)
   * 7. Save to IndexedDB
   * 
   * @param {Object} messageData - The message data to save.
   * @param {string} [recipientKey] - Optional recipient public key
   * @returns {Promise<Object>} The secured message object stored.
   */
  async saveMessage(messageData, recipientKey = null) {
    console.log('[MessageService] Secure save pipeline initiated...');

    // Ensure crypto is ready
    if (!cryptoService.isReady()) {
      await cryptoService.initialize();
    }

    // Step A: Data Minimization
    let sanitized = sanitizeMetadata(messageData);

    // Step B: Auto-compute SHA-256 ID if missing
    if (!sanitized.id) {
      sanitized.id = await computeMessageId(sanitized.content);
    }

    // Step C: Assign Vector Clock (Logical Counter)
    // Every message gets a logical counter instead of relying on system Date.now()
    sanitized = versioningService.assignClock(sanitized);

    // Step D: Pseudonymous Routing (Replace real IDs with randomized hashes)
    if (sanitized.authorId) {
      sanitized.authorId = await securityService.generatePseudonymousId(sanitized.authorId);
    }

    // Step E: Sharding for fragmented messages (Shamir's Secret Sharing)
    if (messageData.is_fragmented) {
      console.log('[MessageService] Fragmented message detected. Sharding...');
      const n = messageData.total_shards || 3; // Default: 3 total shards
      const k = messageData.threshold || 2; // Default: 2 shards needed for reconstruction
      
      const shardingResult = await shardingService.shardMessage(sanitized.content, n, k);
      
      // Store encrypted content in one entry
      const contentEnvelope = {
        ...sanitized,
        content: shardingResult.encryptedContent,
        is_fragmented: true,
        total_shards: n,
        threshold: k,
        shard_id: -1 // -1 indicates this is the encrypted content entry
      };
      const savedContent = await this._secureAndSave(contentEnvelope, recipientKey);
      
      // Store shards in separate entries with shard_id
      const savedShards = [];
      for (const shard of shardingResult.shards) {
        const shardEnvelope = {
          ...sanitized,
          id: `${sanitized.id}-shard-${shard.shard_id}`,
          content: shard.shard_data,
          is_fragmented: true,
          shard_id: shard.shard_id,
          total_shards: shard.total_shards,
          threshold: shard.threshold
        };
        const saved = await this._secureAndSave(shardEnvelope, recipientKey);
        savedShards.push(saved);
      }
      
      console.log(`[MessageService] Saved 1 encrypted content entry and ${savedShards.length} shard entries`);
      return savedContent;
    }

    return await this._secureAndSave(sanitized, recipientKey);
  }

  /**
   * Retrieves all messages from Dexie.
   * @returns {Promise<Array>}
   */
  async getAllMessages() {
    return await db.messages.orderBy('timestamp').reverse().toArray();
  }

  /**
   * Secure and save message envelope using Session-based encryption
   * @private
   */
  async _secureAndSave(envelope, recipientKey) {
    // Step E: E2EE - Encrypt the message content using Session Key (AES-GCM)
    // Constraint: ciphertext only in IndexedDB
    const encryptionResult = await cryptoService.encryptMessage(envelope.content, recipientKey);
    
    // Step F: Prepare final signed envelope
    const finalEnvelope = {
      id: envelope.id,
      timestamp: envelope.timestamp,
      type: envelope.type,
      ciphertext: encryptionResult.ciphertext,
      iv: encryptionResult.iv,
      vectorClock: envelope.vectorClock,
      ttl: envelope.ttl,
      recipientKey: recipientKey,
      isSensitive: envelope.isSensitive,
      isShard: envelope.isShard,
      shardIndex: envelope.shardIndex,
      totalShards: envelope.totalShards,
      shardThreshold: envelope.shardThreshold,
      pseudonymous: true,
      is_propagated: envelope.is_propagated
    };

    // Sign the entire envelope
    const signature = await cryptoService.sign(finalEnvelope);
    const finalMessage = {
      ...finalEnvelope,
      authorId: envelope.authorId, // Now a pseudonymous hash
      signature: signature
    };

    // Save strictly encrypted version to IndexedDB using transaction
    await db.transaction('rw', db.messages, async () => {
      await db.messages.put(finalMessage);
    });
    
    return finalMessage;
  }

  /**
   * Retrieves display content for a message, handling decryption and shard reconstruction
   * @param {Object} message - Message from DB
   * @returns {Promise<Object>} Decrypted content or placeholder
   */
  async getDisplayContent(message) {
    // If it's a shard, we need to find other shards for this message
    if (message.isShard) {
      const parentId = message.id.split('-shard-')[0];
      const allShards = await db.messages
        .filter(m => m.id.startsWith(parentId) && m.isShard)
        .toArray();

      const decryptedShards = [];
      for (const s of allShards) {
        const decrypted = await cryptoService.decryptMessage(s.ciphertext, s.iv);
        if (decrypted) decryptedShards.push(decrypted);
      }

      // Check if we can reconstruct
      if (shardingService.canReconstruct(decryptedShards)) {
        const reconstructed = shardingService.reconstructMessage(decryptedShards);
        if (reconstructed) return reconstructed;
      }

      // Threshold not met - display status message
      const statusMessage = shardingService.getStatusMessage(decryptedShards);
      return { 
        text: statusMessage, 
        isFragmented: true,
        availableShards: decryptedShards.length,
        requiredShards: message.shardThreshold
      };
    }

    if (!message.ciphertext || !message.iv) return message.content;

    try {
      const decrypted = await cryptoService.decryptMessage(message.ciphertext, message.iv);
      if (decrypted) return decrypted;
    } catch (e) {
      // Decryption failed (intended for someone else)
    }

    return { text: '[Encrypted Content]', isEncrypted: true };
  }

  /**
   * Retrieves messages from the database.
   * @returns {Promise<Array>}
   */
  async getAllMessages() {
    return await db.messages.toArray();
  }

  /**
   * Alias for getAllMessages for backward compatibility
   * @returns {Promise<Array>}
   */
  async getMessages() {
    return await this.getAllMessages();
  }
}

export const messageService = new MessageService();
export default messageService;
