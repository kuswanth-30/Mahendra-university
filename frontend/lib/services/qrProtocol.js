/**
 * QR Protocol Handler - Physical Relay Protocol
 * 
 * Defines the schema and validation for QR-based physical relay:
 * - QR_PAYLOAD_SCHEMA: { v, type, id, ts, payload, sig }
 * - isValidQR(data): Validates schema and signature
 * - serializeQR(message): Serializes message to QR format
 * - signQR(data): Signs QR data with ephemeral key
 */

import { cryptoService } from './crypto.js';
import { identityService } from './identity.js';

/**
 * QR Protocol Version
 */
const PROTOCOL_VERSION = '1.0';

/**
 * QR Payload Schema
 * @typedef {Object} QRPayload
 * @property {string} v - Protocol version
 * @property {string} type - Message type ('alert', 'news', 'route', 'dm', 'drop')
 * @property {string} id - Unique message ID
 * @property {number} ts - Unix timestamp (ms)
 * @property {any} payload - Message content
 * @property {string} sig - Ed25519 signature
 */

/**
 * QR Payload Schema Definition
 */
const QR_PAYLOAD_SCHEMA = {
  v: { type: 'string', required: true },
  type: { type: 'string', required: true },
  id: { type: 'string', required: true },
  ts: { type: 'number', required: true },
  payload: { type: 'any', required: true },
  sig: { type: 'string', required: true }
};

/**
 * Valid message types
 */
const VALID_TYPES = ['alert', 'news', 'route', 'dm', 'drop'];

class QRProtocol {
  constructor() {
    this.currentVersion = PROTOCOL_VERSION;
  }

  /**
   * isValidQR(data): Validate QR data schema and signature
   * Checks if all required fields exist and verifies the signature
   * 
   * @param {any} data - QR data to validate
   * @returns {Promise<{valid: boolean, error?: string, version?: string}>}
   */
  async isValidQR(data) {
    try {
      // Check if data is an object
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid data format' };
      }

      // Validate schema
      const schemaValidation = this._validateSchema(data);
      if (!schemaValidation.valid) {
        return schemaValidation;
      }

      // Validate version
      const versionValidation = this._validateVersion(data.v);
      if (!versionValidation.valid) {
        return versionValidation;
      }

      // Validate type
      if (!VALID_TYPES.includes(data.type)) {
        return { valid: false, error: `Invalid message type: ${data.type}` };
      }

      // Verify signature
      const signatureValid = await this._verifySignature(data);
      if (!signatureValid) {
        return { valid: false, error: 'Signature verification failed' };
      }

      return { valid: true, version: data.v };
    } catch (error) {
      console.error('[QRProtocol] Validation error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate QR data against schema
   * @private
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   */
  _validateSchema(data) {
    for (const [field, rules] of Object.entries(QR_PAYLOAD_SCHEMA)) {
      if (rules.required && !(field in data)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }

      if (field in data) {
        const expectedType = rules.type;
        const actualType = typeof data[field];

        if (expectedType !== 'any' && actualType !== expectedType) {
          return { valid: false, error: `Invalid type for ${field}: expected ${expectedType}, got ${actualType}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate protocol version
   * @private
   * @param {string} version - Version string
   * @returns {Object} Validation result
   */
  _validateVersion(version) {
    if (!version) {
      return { valid: false, error: 'Missing version field' };
    }

    const currentMajor = parseInt(this.currentVersion.split('.')[0], 10);
    const dataMajor = parseInt(version.split('.')[0], 10);

    if (dataMajor > currentMajor) {
      return { 
        valid: false, 
        error: 'Protocol Mismatch: QR version is higher than app version',
        versionMismatch: true,
        qrVersion: version,
        appVersion: this.currentVersion
      };
    }

    return { valid: true };
  }

  /**
   * Verify signature of QR data
   * @private
   * @param {Object} data - QR data with signature
   * @returns {Promise<boolean>} True if signature is valid
   */
  async _verifySignature(data) {
    try {
      if (!data.sig || !data.id) {
        console.warn('[QRProtocol] Missing signature or id');
        return false;
      }

      // Ensure crypto service is initialized
      if (!cryptoService.isReady()) {
        await cryptoService.initialize();
      }

      // Verify signature
      const isValid = await cryptoService.verifyMessage(
        data.payload,
        data.sig,
        data.id // Using id as authorId for QR messages
      );

      return isValid;
    } catch (error) {
      console.error('[QRProtocol] Signature verification error:', error);
      return false;
    }
  }

  /**
   * serializeQR(message): Serialize message to QR format
   * Converts message object to QR payload schema
   * 
   * @param {Object} message - Message to serialize
   * @returns {Object} QR payload
   */
  serializeQR(message) {
    return {
      v: this.currentVersion,
      type: message.type || 'drop',
      id: message.id || this._generateId(),
      ts: message.timestamp || Date.now(),
      payload: message.content || message.payload,
      sig: null // Will be added by signQR
    };
  }

  /**
   * signQR(data): Sign QR data with ephemeral key
   * Appends signature field using current ephemeral key pair
   * 
   * @param {Object} data - QR data to sign
   * @returns {Promise<Object>} Signed QR data
   */
  async signQR(data) {
    try {
      // Ensure identity service is initialized
      if (!identityService.isInitialized) {
        await identityService.initialize();
      }

      // Sign the payload
      const signatureResult = await identityService.signPayload(data.payload);

      // Add signature to data
      data.sig = signatureResult.signature;
      data.authorId = signatureResult.publicKey;

      return data;
    } catch (error) {
      console.error('[QRProtocol] Signing error:', error);
      throw error;
    }
  }

  /**
   * Generate unique ID for QR message
   * @private
   * @returns {string} Unique ID
   */
  _generateId() {
    return `qr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * parseQR(jsonString): Parse QR JSON string
   * 
   * @param {string} jsonString - JSON string from QR
   * @returns {Object} Parsed QR data
   */
  parseQR(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[QRProtocol] JSON parse error:', error);
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * stringifyQR(data): Convert QR data to JSON string
   * 
   * @param {Object} data - QR data
   * @returns {string} JSON string
   */
  stringifyQR(data) {
    return JSON.stringify(data);
  }

  /**
   * Get current protocol version
   * @returns {string} Current version
   */
  getCurrentVersion() {
    return this.currentVersion;
  }

  /**
   * Get valid message types
   * @returns {Array} Valid types
   */
  getValidTypes() {
    return VALID_TYPES;
  }
}

export const qrProtocol = new QRProtocol();
export default qrProtocol;
