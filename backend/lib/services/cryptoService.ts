/**
 * Web Crypto Service for 404 Found
 * Ed25519 signatures for message integrity
 * Runs in WebWorker for non-blocking UI
 */

import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

interface SignedMessage {
  data: any;
  signature: string;
  publicKey: string;
  timestamp: number;
}

class CryptoService {
  private static instance: CryptoService;
  private keyPair: KeyPair | null;
  private nodeId: string;

  private constructor() {
    this.keyPair = null;
    this.nodeId = '';
  }

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Initialize Ed25519 key pair
   */
  async initialize(): Promise<void> {
    if (this.keyPair) return;

    try {
      // Generate new Ed25519 key pair
      const privateKey = ed25519.utils.randomPrivateKey();
      const publicKey = await ed25519.getPublicKey(privateKey);

      this.keyPair = { privateKey, publicKey };
      this.nodeId = bytesToHex(publicKey.slice(0, 8));

      console.log('404 FOUND: [CRYPTO] Ed25519 key pair initialized');
      console.log('404 FOUND: [CRYPTO] Node ID:', this.nodeId);
    } catch (error) {
      console.error('404 FOUND: [CRYPTO] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Sign a message with Ed25519
   */
  async signMessage(data: any): Promise<SignedMessage> {
    if (!this.keyPair) {
      await this.initialize();
    }

    const timestamp = Date.now();
    const messageData = {
      ...data,
      _timestamp: timestamp,
      _nodeId: this.nodeId,
    };

    // Create message hash
    const messageBytes = new TextEncoder().encode(JSON.stringify(messageData));
    const messageHash = sha256(messageBytes);

    // Sign the hash
    const signature = await ed25519.sign(messageHash, this.keyPair!.privateKey);

    return {
      data: messageData,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(this.keyPair!.publicKey),
      timestamp,
    };
  }

  /**
   * Verify a signed message
   */
  async verifyMessage(signedMessage: SignedMessage): Promise<boolean> {
    try {
      const { data, signature, publicKey } = signedMessage;

      // Recreate message hash
      const messageBytes = new TextEncoder().encode(JSON.stringify(data));
      const messageHash = sha256(messageBytes);

      // Verify signature
      const signatureBytes = hexToBytes(signature);
      const publicKeyBytes = hexToBytes(publicKey);

      const isValid = await ed25519.verify(signatureBytes, messageHash, publicKeyBytes);

      return isValid;
    } catch (error) {
      console.error('404 FOUND: [CRYPTO] Verification failed:', error);
      return false;
    }
  }

  /**
   * Get node ID (first 8 bytes of public key)
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Get public key hex
   */
  getPublicKeyHex(): string {
    if (!this.keyPair) return '';
    return bytesToHex(this.keyPair.publicKey);
  }

  /**
   * Hash data using SHA-256
   */
  hashData(data: any): string {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const hash = sha256(bytes);
    return bytesToHex(hash);
  }
}

// Export singleton
export const cryptoService = CryptoService.getInstance();
export default cryptoService;

// Export types
export type { KeyPair, SignedMessage };
