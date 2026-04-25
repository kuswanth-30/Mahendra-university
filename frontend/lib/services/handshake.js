/**
 * Handshake Service - Ephemeral Identity Handshake Protocol
 * 
 * Implements performHandshake(peerPublicKey) for secure peer-to-peer handshake.
 * Exchanges only public keys and ephemeral session nonce.
 * Privacy Constraint: No permanent device IDs (UUIDs, IMEI, MAC addresses) in handshake packet.
 */

import { identityService } from './identity.js';

/**
 * Handshake Service class
 */
class HandshakeService {
  constructor() {
    this.sessionNonces = new Map(); // peerPublicKey -> sessionNonce
  }

  /**
   * generateSessionNonce(): Generate ephemeral session nonce
   * @returns {string} Hex-encoded nonce
   * @private
   */
  _generateSessionNonce() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * performHandshake(peerPublicKey): Perform handshake with peer
   * Exchanges only public keys and ephemeral session nonce
   * No permanent device IDs included
   * 
   * @param {string} peerPublicKey - Peer's public key (Base64)
   * @returns {Promise<{success: boolean, handshakePacket?: Object, error?: string}>}
   */
  async performHandshake(peerPublicKey) {
    try {
      // Ensure identity service is initialized
      if (!identityService.isInitialized) {
        await identityService.initialize();
      }

      // Generate ephemeral session nonce
      const sessionNonce = this._generateSessionNonce();

      // Get our public key
      const ourPublicKey = identityService.exportPublicKey();

      if (!ourPublicKey) {
        throw new Error('No public key available');
      }

      // Create handshake packet (NO device IDs)
      const handshakePacket = {
        publicKey: ourPublicKey,              // Our public key
        sessionNonce: sessionNonce,          // Ephemeral session nonce
        timestamp: Date.now(),               // Timestamp for freshness
        // NO device IDs, UUIDs, IMEI, MAC addresses, or permanent identifiers
      };

      // Log handshake in identity service
      identityService.logHandshake(peerPublicKey, sessionNonce);

      // Store session nonce for this peer
      this.sessionNonces.set(peerPublicKey, sessionNonce);

      console.log('[Handshake] Handshake performed with peer');
      console.log('[Handshake] Session nonce:', sessionNonce);

      return {
        success: true,
        handshakePacket
      };
    } catch (error) {
      console.error('[Handshake] Handshake failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * verifyHandshake(handshakePacket): Verify incoming handshake packet
   * Checks that packet contains only allowed fields (no device IDs)
   * 
   * @param {Object} handshakePacket - Incoming handshake packet
   * @returns {boolean} True if packet is valid
   */
  verifyHandshake(handshakePacket) {
    if (!handshakePacket) {
      return false;
    }

    // Check for required fields
    if (!handshakePacket.publicKey || !handshakePacket.sessionNonce) {
      console.warn('[Handshake] Invalid handshake packet: missing required fields');
      return false;
    }

    // Check for forbidden fields (device IDs)
    const forbiddenFields = [
      'deviceId', 'uuid', 'imei', 'macAddress', 'hardwareId',
      'serialNumber', 'deviceIdentifier', 'permanentId'
    ];

    for (const field of forbiddenFields) {
      if (handshakePacket[field]) {
        console.warn(`[Handshake] Invalid handshake packet: contains forbidden field: ${field}`);
        return false;
      }
    }

    // Check timestamp freshness (within 5 minutes)
    if (handshakePacket.timestamp) {
      const now = Date.now();
      const age = now - handshakePacket.timestamp;
      if (age > 5 * 60 * 1000) { // 5 minutes
        console.warn('[Handshake] Invalid handshake packet: timestamp too old');
        return false;
      }
    }

    return true;
  }

  /**
   * getSessionNonce(peerPublicKey): Get session nonce for peer
   * @param {string} peerPublicKey - Peer's public key
   * @returns {string|undefined} Session nonce
   */
  getSessionNonce(peerPublicKey) {
    return this.sessionNonces.get(peerPublicKey);
  }

  /**
   * clearSessionNonce(peerPublicKey): Clear session nonce for peer
   * @param {string} peerPublicKey - Peer's public key
   */
  clearSessionNonce(peerPublicKey) {
    this.sessionNonces.delete(peerPublicKey);
  }

  /**
   * clearAllSessionNonces(): Clear all session nonces
   */
  clearAllSessionNonces() {
    this.sessionNonces.clear();
  }
}

// Export singleton instance
export const handshakeService = new HandshakeService();
export default handshakeService;
