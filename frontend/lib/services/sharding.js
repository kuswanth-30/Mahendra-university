/**
 * Sharding Service - Data Fragmentation for Sensitive Messages
 * 
 * Implements Shamir's Secret Sharing (SSS) for threshold-based sharding.
 * Uses secrets.js-grempe library for cryptographic secret sharing.
 * 
 * Process:
 * 1. Encrypt content with temporary symmetric key
 * 2. Split the encryption key into n shards using secrets.share()
 * 3. Store encrypted content in one entry
 * 4. Store shards in separate entries with shard_id
 */

import secrets from 'secrets.js-grempe';

class ShardingService {
  /**
   * shardMessage(content, n, k): Encrypt content and split encryption key into shards
   * 
   * @param {any} content - Content to shard
   * @param {number} n - Total number of shards to create
   * @param {number} k - Threshold for reconstruction (min shards needed)
   * @returns {Promise<{encryptedContent: string, encryptedKey: string, shards: Array}>}
   */
  async shardMessage(content, n = 3, k = 2) {
    try {
      const dataString = typeof content === 'string' ? content : JSON.stringify(content);
      
      // Step 1: Generate temporary symmetric key
      const symmetricKey = await this._generateSymmetricKey();
      
      // Step 2: Encrypt content with symmetric key
      const encryptedContent = await this._encryptContent(dataString, symmetricKey);
      
      // Step 3: Split the encryption key into n shards using Shamir's Secret Sharing
      const keyHex = this._stringToHex(symmetricKey);
      const keyShares = secrets.share(keyHex, n, k);
      
      // Step 4: Convert shares to fragment format with shard_id
      const shards = keyShares.map((share, index) => ({
        shard_id: index,
        total_shards: n,
        threshold: k,
        shard_data: share
      }));
      
      console.log(`[Sharding] Created ${n} shards with threshold ${k}`);
      
      return {
        encryptedContent,
        encryptedKey: symmetricKey, // For testing (not stored in production)
        shards
      };
    } catch (error) {
      console.error('[Sharding] Failed to shard message:', error);
      throw error;
    }
  }

  /**
   * reconstructMessage(shards, encryptedContent): Reconstruct message from shards
   * 
   * @param {Array<{shard_id: number, shard_data: string, total_shards: number, threshold: number}>} shards
   * @param {string} encryptedContent - Encrypted content to decrypt
   * @returns {Promise<any|null>} Reconstructed content or null if threshold not met
   */
  async reconstructMessage(shards, encryptedContent) {
    if (!shards || shards.length === 0) return null;
    if (!encryptedContent) return null;
    
    const threshold = shards[0].threshold;
    const total = shards[0].total_shards;

    // Check if threshold is met
    if (shards.length < threshold) {
      console.log(`[Sharding] Threshold not met: have ${shards.length}, need ${threshold}`);
      return null;
    }

    try {
      // Step 1: Extract share strings from shards
      const shares = shards.map(s => s.shard_data);
      
      // Step 2: Combine shares using Shamir's Secret Sharing to recover key
      const hexKey = secrets.combine(shares);
      const symmetricKey = this._hexToString(hexKey);
      
      // Step 3: Decrypt content with recovered key
      const decryptedString = await this._decryptContent(encryptedContent, symmetricKey);
      
      // Step 4: Try to parse as JSON, otherwise return as string
      try {
        return JSON.parse(decryptedString);
      } catch (e) {
        return decryptedString;
      }
    } catch (error) {
      console.error('[Sharding] Reconstruction failed:', error);
      return null;
    }
  }

  /**
   * _generateSymmetricKey(): Generate temporary symmetric key
   * @private
   */
  async _generateSymmetricKey() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * _encryptContent(content, key): Encrypt content with symmetric key
   * @private
   */
  async _encryptContent(content, key) {
    // Simple XOR encryption for demonstration (in production, use AES-GCM)
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);
    const keyBytes = encoder.encode(key);
    
    const encrypted = new Uint8Array(contentBytes.length);
    for (let i = 0; i < contentBytes.length; i++) {
      encrypted[i] = contentBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return this._arrayBufferToBase64(encrypted);
  }

  /**
   * _decryptContent(encryptedContent, key): Decrypt content with symmetric key
   * @private
   */
  async _decryptContent(encryptedContent, key) {
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(key);
    
    const encrypted = this._base64ToArrayBuffer(encryptedContent);
    
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Check if enough fragments are available for reconstruction
   * 
   * @param {Array} shards - Available shards
   * @returns {boolean} True if threshold is met
   */
  canReconstruct(shards) {
    if (!shards || shards.length === 0) return false;
    const threshold = shards[0]?.threshold || 2;
    return shards.length >= threshold;
  }

  /**
   * Get the message to display when threshold is not met
   * 
   * @param {Array} shards - Available shards
   * @returns {string} Status message
   */
  getStatusMessage(shards) {
    if (!shards || shards.length === 0) {
      return "Fragmented: No shards available";
    }
    
    const threshold = shards[0]?.threshold || 2;
    const total = shards[0]?.total_shards || 3;
    
    if (shards.length < threshold) {
      return `Fragmented: Waiting for secondary nodes (${shards.length}/${threshold} shards)`;
    }
    
    return "Ready to reconstruct";
  }

  // Internal Helpers

  _stringToHex(str) {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }

  _hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  }

  _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  _base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const shardingService = new ShardingService();
export default shardingService;
