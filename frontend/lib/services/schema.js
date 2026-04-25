/**
 * Schema Definition - Unified Message Interface for 404 Found
 * 
 * Defines the unified message structure for all message types:
 * - News/Alerts (Version Vectors)
 * - Routes (GeoJSON)
 * - DMs (E2EE/Public Key)
 * - Drops (QR Dead Drops)
 */

/**
 * Unified Message Interface
 * @typedef {Object} UnifiedMessage
 * @property {string} type - Message type: 'news' | 'route' | 'dm' | 'drop'
 * @property {any} payload - Message content (varies by type)
 * @property {MessageMetadata} metadata - Common metadata
 */

/**
 * Message Metadata
 * @typedef {Object} MessageMetadata
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {number} version - Version number for conflict resolution
 * @property {Geolocation|null} location - GPS coordinates (optional)
 * @property {number|null} ttl - Time-to-live in milliseconds (optional)
 * @property {string} authorId - Author's public key hash
 * @property {string} signature - Ed25519 signature
 * @property {string} source - Source: 'p2p' | 'qr_drop' | 'physical_drop'
 */

/**
 * Geolocation
 * @typedef {Object} Geolocation
 * @property {number} latitude - Latitude in degrees
 * @property {number} longitude - Longitude in degrees
 * @property {number} accuracy - Accuracy in meters
 * @property {number} timestamp - Location timestamp
 */

/**
 * News/Alert Payload
 * @typedef {Object} NewsPayload
 * @property {string} title - News title
 * @property {string} content - News content
 * @property {string} severity - 'info' | 'warning' | 'critical'
 * @property {string[]} tags - Content tags
 */

/**
 * Route Payload (GeoJSON)
 * @typedef {Object} RoutePayload
 * @property {string} name - Route name
 * @property {GeoJSON} geometry - GeoJSON LineString or Polygon
 * @property {RouteProperties} properties - Route properties
 */

/**
 * Route Properties
 * @typedef {Object} RouteProperties
 * @property {string} type - 'safe_route' | 'danger_zone' | 'checkpoint'
 * @property {number} validityWindow - Validity window in hours
 * @property {number} radius - Validity radius in meters
 * @property {string[]} hazards - List of hazards
 */

/**
 * DM Payload (E2EE)
 * @typedef {Object} DMPayload
 * @property {string} recipientId - Recipient's public key hash
 * @property {string} ciphertext - Encrypted message content
 * @property {string} iv - Initialization vector
 * @property {string} ephemeralKey - Ephemeral public key for ECDH
 */

/**
 * Drop Payload (QR Dead Drop)
 * @typedef {Object} DropPayload
 * @property {string} content - Drop content
 * @property {string} dropId - Unique drop identifier
 * @property {number} expiresAt - Expiration timestamp
 */

class SchemaValidator {
  /**
   * Validate a unified message structure
   * @param {any} message - Message to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validateMessage(message) {
    const errors = [];

    // Check required fields
    if (!message.type) {
      errors.push('Missing required field: type');
    }

    if (!message.payload) {
      errors.push('Missing required field: payload');
    }

    if (!message.metadata) {
      errors.push('Missing required field: metadata');
    } else {
      if (!message.metadata.timestamp) {
        errors.push('Missing required field: metadata.timestamp');
      }
      if (!message.metadata.version) {
        errors.push('Missing required field: metadata.version');
      }
      if (!message.metadata.authorId) {
        errors.push('Missing required field: metadata.authorId');
      }
      if (!message.metadata.signature) {
        errors.push('Missing required field: metadata.signature');
      }
    }

    // Validate type-specific payload
    if (message.type && message.payload) {
      const typeValidation = this.validatePayload(message.type, message.payload);
      errors.push(...typeValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate type-specific payload
   * @param {string} type - Message type
   * @param {any} payload - Payload to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validatePayload(type, payload) {
    const errors = [];

    switch (type) {
      case 'news':
        if (!payload.title) errors.push('News payload missing: title');
        if (!payload.content) errors.push('News payload missing: content');
        if (!payload.severity) errors.push('News payload missing: severity');
        break;

      case 'route':
        if (!payload.name) errors.push('Route payload missing: name');
        if (!payload.geometry) errors.push('Route payload missing: geometry');
        if (!payload.properties) errors.push('Route payload missing: properties');
        if (payload.properties && !payload.properties.type) {
          errors.push('Route properties missing: type');
        }
        break;

      case 'dm':
        if (!payload.recipientId) errors.push('DM payload missing: recipientId');
        if (!payload.ciphertext) errors.push('DM payload missing: ciphertext');
        if (!payload.iv) errors.push('DM payload missing: iv');
        break;

      case 'drop':
        if (!payload.content) errors.push('Drop payload missing: content');
        if (!payload.dropId) errors.push('Drop payload missing: dropId');
        if (!payload.expiresAt) errors.push('Drop payload missing: expiresAt');
        break;

      default:
        errors.push(`Unknown message type: ${type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize a message by removing invalid fields
   * @param {any} message - Message to sanitize
   * @returns {Object} Sanitized message
   */
  static sanitizeMessage(message) {
    const validTypes = ['news', 'route', 'dm', 'drop'];
    
    return {
      type: validTypes.includes(message.type) ? message.type : 'news',
      payload: message.payload || {},
      metadata: {
        timestamp: message.metadata?.timestamp || Date.now(),
        version: message.metadata?.version || 1,
        location: message.metadata?.location || null,
        ttl: message.metadata?.ttl || null,
        authorId: message.metadata?.authorId || '',
        signature: message.metadata?.signature || '',
        source: message.metadata?.source || 'p2p'
      }
    };
  }

  /**
   * Convert unified message to Dexie format
   * @param {UnifiedMessage} message - Unified message
   * @returns {Object} Dexie-compatible message
   */
  static toDexieFormat(message) {
    return {
      id: message.id || this.generateId(message),
      type: message.type,
      content: message.payload,
      timestamp: message.metadata.timestamp,
      version: message.metadata.version,
      location: message.metadata.location,
      ttl: message.metadata.ttl,
      authorId: message.metadata.authorId,
      signature: message.metadata.signature,
      source: message.metadata.source,
      vectorClock: message.metadata.vectorClock
    };
  }

  /**
   * Convert Dexie message to unified format
   * @param {Object} dexieMessage - Dexie message
   * @returns {UnifiedMessage} Unified message
   */
  static fromDexieFormat(dexieMessage) {
    return {
      type: dexieMessage.type,
      payload: dexieMessage.content,
      metadata: {
        timestamp: dexieMessage.timestamp,
        version: dexieMessage.version,
        location: dexieMessage.location,
        ttl: dexieMessage.ttl,
        authorId: dexieMessage.authorId,
        signature: dexieMessage.signature,
        source: dexieMessage.source,
        vectorClock: dexieMessage.vectorClock
      }
    };
  }

  /**
   * Generate a unique ID for a message
   * @param {UnifiedMessage} message - Message to generate ID for
   * @returns {string} Unique ID
   */
  static generateId(message) {
    const idString = `${message.type}-${message.metadata.timestamp}-${message.metadata.authorId}`;
    return this.hashString(idString);
  }

  /**
   * Hash a string using SHA-256
   * @param {string} str - String to hash
   * @returns {string} Hex hash
   */
  static async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export { SchemaValidator };
export default SchemaValidator;
