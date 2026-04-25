/**
 * Identity Service - Ephemeral Identity Management
 * 
 * Implements 24-hour key rotation for Ed25519 key pairs.
 * CRITICAL: Private keys are stored in-memory ONLY, never persisted to disk, IndexedDB, localStorage, or sessionStorage.
 * Public keys may be cached in memory for session duration only.
 */

class IdentityService {
  constructor() {
    this.keyPair = null; // In-memory key pair (CRITICAL: never persisted)
    this.publicKeyBase64 = null; // In-memory public key
    this.rotationInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.rotationTimer = null;
    this.isInitialized = false;
    this.lastRotationTimestamp = null; // In-memory timestamp
    this.handshakeLog = new Map(); // In-memory handshake log (peerPublicKey -> sessionNonce)
  }

  /**
   * Initialize the identity service
   * Generates new key pair on every app start (ephemeral identity)
   * Checks if rotation is needed based on in-memory timestamp
   * @returns {Promise<{success: boolean, publicKey: string}>}
   */
  async initialize() {
    try {
      const now = Date.now();
      
      // Check if key needs rotation (24 hours from last rotation)
      if (this.lastRotationTimestamp && (now - this.lastRotationTimestamp < this.rotationInterval)) {
        console.log('[Identity] Using existing ephemeral key pair');
        this.isInitialized = true;
        this._startRotationTimer();
        return { success: true, publicKey: this.publicKeyBase64 };
      }

      // Generate new key pair (ephemeral identity)
      await this.rotateKeys();
      
      this.isInitialized = true;
      this._startRotationTimer();
      
      return { success: true, publicKey: this.publicKeyBase64 };
    } catch (error) {
      console.error('[Identity] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * rotateKeys(): Generates a new Ed25519 key pair
   * Called every 24 hours or on app start
   * CRITICAL: Private key is NEVER persisted
   * @returns {Promise<{success: boolean, publicKey: string}>}
   */
  async rotateKeys() {
    try {
      console.log('[Identity] Rotating keys (24-hour cycle)...');
      
      // Purge old identity from handshake logs
      this.wipeOldIdentity();
      
      // Generate new key pair
      await this._generateKeyPair();
      
      // Update in-memory timestamp
      this.lastRotationTimestamp = Date.now();
      
      console.log('[Identity] Key rotation complete. New Public Key:', this.publicKeyBase64);
      
      return { success: true, publicKey: this.publicKeyBase64 };
    } catch (error) {
      console.error('[Identity] Key rotation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * _generateKeyPair(): Internal method to generate Ed25519 key pair
   * Private key is kept in-memory only
   * @private
   */
  async _generateKeyPair() {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'Ed25519'
      },
      true, // extractable (for export/sign)
      ['sign', 'verify']
    );

    // Export public key for sharing
    const exportedPublic = await window.crypto.subtle.exportKey(
      'spki',
      this.keyPair.publicKey
    );

    this.publicKeyBase64 = this._arrayBufferToBase64(exportedPublic);
  }

  /**
   * exportPublicKey(): Returns the current public key for session-based encryption
   * @returns {string} Base64 encoded public key
   */
  exportPublicKey() {
    if (!this.publicKeyBase64) {
      console.warn('[Identity] No public key available');
      return null;
    }
    return this.publicKeyBase64;
  }

  /**
   * getPrivateKey(): Returns the private key (in-memory only)
   * Used for signing operations
   * @returns {CryptoKey} Private key
   */
  getPrivateKey() {
    return this.keyPair?.privateKey;
  }

  /**
   * signPayload(payload): Signs a payload with the current private key
   * @param {any} payload - Payload to sign
   * @returns {Promise<{signature: string, publicKey: string}>}
   */
  async signPayload(payload) {
    if (!this.isInitialized) {
      await this.initialize();
    }

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
        signature: this._arrayBufferToBase64(signature),
        publicKey: this.publicKeyBase64
      };
    } catch (error) {
      console.error('[Identity] Signing failed:', error);
      throw error;
    }
  }

  /**
   * _startRotationTimer(): Starts the 24-hour rotation timer
   * @private
   */
  _startRotationTimer() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      await this.rotateKeys();
    }, this.rotationInterval);

    console.log('[Identity] Rotation timer started (24-hour cycle)');
  }

  /**
   * stopRotationTimer(): Stops the rotation timer
   */
  stopRotationTimer() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * wipeIdentity(): Clears all identity data from memory
   * Called during panic wipe
   */
  wipeIdentity() {
    console.warn('[Identity] Wiping identity data...');
    
    this.keyPair = null;
    this.publicKeyBase64 = null;
    this.isInitialized = false;
    this.lastRotationTimestamp = null;
    
    // Clear handshake log
    this.handshakeLog.clear();
    
    this.stopRotationTimer();
    
    console.log('[Identity] Identity data wiped');
  }

  /**
   * wipeOldIdentity(): Purges cached public key mappings from handshake logs
   * Called during key rotation to ensure old identity is not reused
   */
  wipeOldIdentity() {
    console.log('[Identity] Purging old identity from handshake logs...');
    
    // Clear in-memory handshake log
    this.handshakeLog.clear();
    
    console.log('[Identity] Old identity purged');
  }

  /**
   * logHandshake(peerPublicKey, sessionNonce): Log handshake for session tracking
   * @param {string} peerPublicKey - Peer's public key
   * @param {string} sessionNonce - Ephemeral session nonce
   */
  logHandshake(peerPublicKey, sessionNonce) {
    this.handshakeLog.set(peerPublicKey, {
      sessionNonce,
      timestamp: Date.now()
    });
  }

  /**
   * getHandshakeLog(): Get current handshake log
   * @returns {Map} Handshake log
   */
  getHandshakeLog() {
    return this.handshakeLog;
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
}

export const identityService = new IdentityService();
export default identityService;
