/**
 * QR Integration Service - JSON decoding and routing to appropriate stores
 * 
 * Implements html5-qrcode ingestion flow:
 * - Scans QR codes and decodes JSON
 * - Routes to appropriate stores (NewsStore, RouteStore, DMStore, DropStore)
 * - Validates message structure using SchemaValidator
 */

import { db } from '@/lib/db';
import { SchemaValidator } from './schema.js';
import { cryptoService } from './crypto.js';

class QRService {
  constructor() {
    this.scanner = null;
    this.isScanning = false;
  }

  /**
   * Initialize QR scanner
   * @param {string} elementId - DOM element ID for scanner
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initializeScanner(elementId) {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      this.scanner = new Html5Qrcode(elementId);
      console.log('[QRService] Scanner initialized');
      return { success: true };
    } catch (error) {
      console.error('[QRService] Scanner initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start scanning for QR codes
   * @param {Function} onScanSuccess - Callback for successful scan
   * @param {Function} onScanFailure - Callback for scan failure
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startScanning(onScanSuccess, onScanFailure) {
    if (!this.scanner) {
      return { success: false, error: 'Scanner not initialized' };
    }

    if (this.isScanning) {
      return { success: false, error: 'Already scanning' };
    }

    try {
      this.isScanning = true;
      
      await this.scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        async (decodedText, decodedResult) => {
          // Stop scanning immediately after successful scan (battery saving)
          await this.stopScanning();
          
          // Process the scanned QR code
          const result = await this.processQRCode(decodedText);
          
          if (onScanSuccess) {
            onScanSuccess(result);
          }
        },
        (errorMessage) => {
          if (onScanFailure) {
            onScanFailure(errorMessage);
          }
        }
      );

      console.log('[QRService] Scanning started');
      return { success: true };
    } catch (error) {
      console.error('[QRService] Failed to start scanning:', error);
      this.isScanning = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop scanning
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stopScanning() {
    if (!this.scanner || !this.isScanning) {
      return { success: true };
    }

    try {
      await this.scanner.stop();
      this.isScanning = false;
      console.log('[QRService] Scanning stopped');
      return { success: true };
    } catch (error) {
      console.error('[QRService] Failed to stop scanning:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process QR code data
   * Decodes JSON and routes to appropriate store
   * @param {string} qrData - QR code data (JSON string)
   * @returns {Promise<Object>} Processing result
   */
  async processQRCode(qrData) {
    try {
      console.log('[QRService] Processing QR code data');

      // Parse JSON
      let message;
      try {
        message = JSON.parse(qrData);
      } catch (error) {
        return { success: false, error: 'Invalid JSON format' };
      }

      // Validate message structure
      const validation = SchemaValidator.validateMessage(message);
      if (!validation.valid) {
        console.error('[QRService] Validation failed:', validation.errors);
        return { success: false, error: 'Invalid message structure', errors: validation.errors };
      }

      // Verify signature
      const isValid = await cryptoService.verifyMessage(
        message.payload,
        message.metadata.signature,
        message.metadata.authorId
      );

      if (!isValid) {
        return { success: false, error: 'Signature verification failed' };
      }

      // Route to appropriate store based on message type
      const storeResult = await this.routeToStore(message);

      return storeResult;
    } catch (error) {
      console.error('[QRService] QR processing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Route message to appropriate store based on type
   * @param {Object} message - Validated message
   * @returns {Promise<Object>} Store result
   */
  async routeToStore(message) {
    const dexieMessage = SchemaValidator.toDexieFormat(message);
    
    // Set metadata for QR drops
    dexieMessage.source = 'qr_drop';
    dexieMessage.is_propagated = true;

    try {
      // Use Dexie transaction for data integrity
      await db.transaction('rw', db.messages, async () => {
        await db.messages.put(dexieMessage);
      });

      console.log(`[QRService] Message routed to store: ${message.type}`);

      // Dispatch event for UI
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('qr:message_stored', {
          detail: { messageId: dexieMessage.id, type: message.type }
        }));
      }

      return { 
        success: true, 
        messageId: dexieMessage.id, 
        type: message.type,
        source: 'qr_drop'
      };
    } catch (error) {
      console.error('[QRService] Failed to store message:', error);
      return { success: false, error: 'Failed to store message' };
    }
  }

  /**
   * Generate QR code data for a message
   * @param {Object} message - Message to encode
   * @returns {string} JSON string for QR code
   */
  generateQRData(message) {
    // Validate message first
    const validation = SchemaValidator.validateMessage(message);
    if (!validation.valid) {
      throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
    }

    // Convert to JSON
    return JSON.stringify(message);
  }

  /**
   * Get messages by type from store
   * @param {string} type - Message type ('news', 'route', 'dm', 'drop')
   * @returns {Promise<Array>} Messages of specified type
   */
  async getMessagesByType(type) {
    try {
      const messages = await db.messages
        .where('type')
        .equals(type)
        .toArray();
      
      return messages.map(msg => SchemaValidator.fromDexieFormat(msg));
    } catch (error) {
      console.error('[QRService] Failed to get messages by type:', error);
      return [];
    }
  }

  /**
   * Get all QR drop messages
   * @returns {Promise<Array>} QR drop messages
   */
  async getQRDrops() {
    try {
      const messages = await db.messages
        .filter(msg => msg.source === 'qr_drop' || msg.source === 'physical_drop')
        .toArray();
      
      return messages.map(msg => SchemaValidator.fromDexieFormat(msg));
    } catch (error) {
      console.error('[QRService] Failed to get QR drops:', error);
      return [];
    }
  }

  /**
   * Cleanup scanner resources
   */
  async cleanup() {
    if (this.isScanning) {
      await this.stopScanning();
    }
    
    if (this.scanner) {
      try {
        await this.scanner.clear();
        this.scanner = null;
      } catch (error) {
        console.error('[QRService] Cleanup failed:', error);
      }
    }
  }
}

export const qrService = new QRService();
export default qrService;
