/**
 * Crypto Service - Ephemeral Identity Management
 * 
 * Uses Web Crypto API (window.crypto.subtle) to generate and manage 
 * Ed25519 key pairs for message signing and verification.
 * 
 * Key Policy:
 * - Private keys are stored IN-MEMORY only (never persisted).
 * - Key rotation (Session Reset) destroys old keys and generates new ones.
 */

import { db } from '../db';

class CryptoService {
  constructor() {
    this.keyPair = null; // In-memory { publicKey, privateKey }
    this.publicKeyBase64 = null;
    this.isInitialized = false;
  }

  /**
   * generateKeyPair(): Generates a new Ed25519 key pair for signing.
   * Private key remains in memory (ephemeral).
   * Alias for generateEphemeralKeys() for API compatibility.
   */
  async generateKeyPair() {
    return await this.generateEphemeralKeys();
  }

  /**
   * generateEphemeralKeys(): Generates a new Ed25519 key pair.
   * Private key remains in memory.
   */
  async generateEphemeralKeys() {
    try {
      console.log('[Crypto] Generating new ephemeral Ed25519 key pair...');
      
      this.keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'Ed25519'
        },
        true, // extractable (for export/sign)
        ['sign', 'verify']
      );

      // Export public key for sharing (SPKI format)
      const exportedPublic = await window.crypto.subtle.exportKey(
        'spki',
        this.keyPair.publicKey
      );
      
      this.publicKeyBase64 = this._arrayBufferToBase64(exportedPublic);
      this.isInitialized = true;
      
      console.log('[Crypto] Key rotation complete. New Public Key:', this.publicKeyBase64);
      return this.publicKeyBase64;
    } catch (error) {
      console.error('[Crypto] Key generation failed:', error);
      throw error;
    }
  }

  /**
   * signPayload(payload): Middleware to sign outgoing messages.
   * Attaches signature and current public key to the payload.
   */
  async signPayload(payload) {
    if (!this.isInitialized) await this.generateEphemeralKeys();

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(payload));
      
      const signature = await window.crypto.subtle.sign(
        {
          name: 'Ed25519'
        },
        this.keyPair.privateKey,
        data
      );

      return {
        ...payload,
        signature: this._arrayBufferToBase64(signature),
        publicKey: this.publicKeyBase64,
        signedAt: Date.now()
      };
    } catch (error) {
      console.error('[Crypto] Signing failed:', error);
      throw error;
    }
  }

  /**
   * verifyPayload(payload, publicKey): Verifies an incoming signed message.
   */
  async verifyPayload(payload, publicKeyBase64) {
    try {
      const { signature, ...originalPayload } = payload;
      if (!signature) return false;

      // Import the sender's public key
      const publicKeyBuffer = this._base64ToArrayBuffer(publicKeyBase64);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'Ed25519' },
        false,
        ['verify']
      );

      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(originalPayload));
      const signatureBuffer = this._base64ToArrayBuffer(signature);

      return await window.crypto.subtle.verify(
        { name: 'Ed25519' },
        publicKey,
        signatureBuffer,
        data
      );
    } catch (error) {
      console.error('[Crypto] Verification error:', error);
      return false;
    }
  }

  /**
   * encryptMessage(content, recipientPublicKey): Encrypts content using AES-GCM
   * @param {any} content - Content to encrypt
   * @param {string} [recipientPublicKey] - Optional recipient public key (for future E2EE)
   * @returns {Promise<{ciphertext: string, iv: string}>}
   */
  async encryptMessage(content, recipientPublicKey = null) {
    try {
      // Generate a random AES-GCM key for this message
      const aesKey = await window.crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Generate random IV
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Encode content
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(content));

      // Encrypt
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        aesKey,
        data
      );

      // Export the AES key (in a real E2EE system, this would be encrypted with recipient's public key)
      // For now, we'll store the key alongside the message (session-based encryption)
      const exportedKey = await window.crypto.subtle.exportKey('raw', aesKey);

      return {
        ciphertext: this._arrayBufferToBase64(ciphertext),
        iv: this._arrayBufferToBase64(iv),
        key: this._arrayBufferToBase64(exportedKey) // Session key (in production, encrypt with recipient's public key)
      };
    } catch (error) {
      console.error('[Crypto] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * decryptMessage(encryptedContent, iv, key): Decrypts content using AES-GCM
   * @param {string} encryptedContent - Base64 encoded ciphertext
   * @param {string} iv - Base64 encoded IV
   * @param {string} key - Base64 encoded AES key
   * @returns {Promise<any>} Decrypted content
   */
  async decryptMessage(encryptedContent, iv, key) {
    try {
      // Import the AES key
      const keyBuffer = this._base64ToArrayBuffer(key);
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        keyBuffer,
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Import IV
      const ivBuffer = this._base64ToArrayBuffer(iv);

      // Import ciphertext
      const ciphertextBuffer = this._base64ToArrayBuffer(encryptedContent);

      // Decrypt
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer
        },
        aesKey,
        ciphertextBuffer
      );

      // Decode
      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decrypted);
      return JSON.parse(decryptedText);
    } catch (error) {
      console.error('[Crypto] Decryption failed:', error);
      return null;
    }
  }

  /**
   * signMessage(payload): Signs a message payload in minimalist format
   * Returns { m, t, s, id } format for efficient mesh transmission
   * 
   * @param {any} payload - Payload to sign
   * @returns {Promise<{m: string, t: number, s: string, id: string}>} Signed message
   */
  async signMessage(payload) {
    if (!this.isInitialized) await this.generateEphemeralKeys();

    try {
      const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const timestamp = Date.now();
      
      // Generate deterministic id from content hash
      const id = await this._generateDeterministicId(content);

      // Sign the content
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      
      const signature = await window.crypto.subtle.sign(
        {
          name: 'Ed25519'
        },
        this.keyPair.privateKey,
        data
      );

      // Return minimalist payload format
      return {
        m: content,              // Content
        t: timestamp,            // Timestamp
        s: this._arrayBufferToBase64(signature),  // Signature
        id: id                   // Deterministic hash for deduplication
      };
    } catch (error) {
      console.error('[Crypto] Signing failed:', error);
      throw error;
    }
  }

  /**
   * _generateDeterministicId(content): Generates deterministic hash of message content
   * Used for id field to prevent duplicate processing
   * @private
   */
  async _generateDeterministicId(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * verifyMessage(payload, signature, publicKey): Verifies a message signature
   * Handles both minimalist format { m, t, s, id } and legacy format
   * 
   * @param {any} payload - Original payload or signed message object
   * @param {string} signature - Base64 encoded signature (optional if in payload)
   * @param {string} publicKey - Base64 encoded public key
   * @returns {Promise<boolean>} Verification result
   */
  async verifyMessage(payload, signature, publicKey) {
    try {
      // Handle minimalist format { m, t, s, id }
      if (payload.m && payload.s) {
        const { m: content, s: sig } = payload;
        
        // Import the sender's public key
        const publicKeyBuffer = this._base64ToArrayBuffer(publicKey);
        const pubKey = await window.crypto.subtle.importKey(
          'spki',
          publicKeyBuffer,
          { name: 'Ed25519' },
          false,
          ['verify']
        );

        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const signatureBuffer = this._base64ToArrayBuffer(sig);

        return await window.crypto.subtle.verify(
          { name: 'Ed25519' },
          pubKey,
          signatureBuffer,
          data
        );
      }
      
      // Handle legacy format
      const signedPayload = {
        ...payload,
        signature: signature
      };
      return await this.verifyPayload(signedPayload, publicKey);
    } catch (error) {
      console.error('[Crypto] Verification error:', error);
      return false;
    }
  }

  /**
   * rotateKeys(): Alias for resetSession() - Key rotation on app launch
   * Destroys old keys and generates new Ed25519 key pair
   * Private key remains in memory (ephemeral)
   */
  async rotateKeys() {
    return await this.resetSession();
  }

  /**
   * resetSession(): Triggers key rotation
   */
  async resetSession() {
    console.log('[Crypto] Resetting session/rotating keys...');
    this.keyPair = null;
    this.publicKeyBase64 = null;
    this.isInitialized = false;
    return await this.generateEphemeralKeys();
  }

  getPublicKey() {
    return this.publicKeyBase64;
  }

  isReady() {
    return this.isInitialized;
  }

  // Internal Helpers
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

export const cryptoService = new CryptoService();
export default cryptoService;
