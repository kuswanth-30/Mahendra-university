/**
 * Serialization Service - Protocol Buffers for message encoding/decoding
 * 
 * Uses protobufjs to encode/decode messages in binary format for efficient
 * Bluetooth LE transmission. Significantly smaller than JSON.
 */

import protobuf from 'protobufjs';

/**
 * MeshMessage interface matching the .proto definition
 */
export interface MeshMessage {
  m: string;   // Content
  t: number;   // Timestamp
  s: Uint8Array; // Signature (bytes)
  id: string;  // Unique ID
}

/**
 * Serialization Service class
 */
class SerializationService {
  private root: any = null;
  private MeshMessage: any = null;
  private isInitialized = false;

  /**
   * Initialize the protobuf schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load the .proto file at runtime
      const protoPath = '/schema/message.proto';
      
      // In a browser environment, we need to fetch the proto file
      const response = await fetch(protoPath);
      const protoContent = await response.text();
      
      // Parse the proto definition
      this.root = protobuf.parse(protoContent).root;
      
      // Get the MeshMessage type
      this.MeshMessage = this.root.lookupType('mesh.MeshMessage');
      
      this.isInitialized = true;
      console.log('[Serialization] Protocol Buffers initialized');
    } catch (error) {
      console.error('[Serialization] Initialization failed:', error);
      // Fallback: create a simple encoder/decoder if proto loading fails
      this._initializeFallback();
    }
  }

  /**
   * Fallback initialization if proto loading fails
   * @private
   */
  private _initializeFallback(): void {
    console.warn('[Serialization] Using fallback JSON-based encoding');
    this.isInitialized = true;
  }

  /**
   * encodeMessage(msg): Encode a message to binary format
   * 
   * @param {MeshMessage} msg - Message to encode
   * @returns {Promise<Uint8Array>} Encoded binary data
   */
  async encodeMessage(msg: MeshMessage): Promise<Uint8Array> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.MeshMessage) {
        // Use Protocol Buffers encoding
        const message = this.MeshMessage.create(msg);
        const buffer = this.MeshMessage.encode(message).finish();
        return new Uint8Array(buffer);
      } else {
        // Fallback: JSON encoding
        const jsonString = JSON.stringify(msg);
        const encoder = new TextEncoder();
        return encoder.encode(jsonString);
      }
    } catch (error) {
      console.error('[Serialization] Encoding failed:', error);
      throw error;
    }
  }

  /**
   * decodeMessage(buffer): Decode a binary message
   * 
   * @param {Uint8Array} buffer - Binary data to decode
   * @returns {Promise<MeshMessage>} Decoded message
   */
  async decodeMessage(buffer: Uint8Array): Promise<MeshMessage> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.MeshMessage) {
        // Use Protocol Buffers decoding
        const message = this.MeshMessage.decode(buffer);
        return message as MeshMessage;
      } else {
        // Fallback: JSON decoding
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(buffer);
        return JSON.parse(jsonString) as MeshMessage;
      }
    } catch (error) {
      console.error('[Serialization] Decoding failed:', error);
      throw error;
    }
  }

  /**
   * encodeMessageFromMinimal(msg): Encode from minimalist format { m, t, s, id }
   * 
   * @param {any} msg - Minimalist message object
   * @returns {Promise<Uint8Array>} Encoded binary data
   */
  async encodeMessageFromMinimal(msg: { m: string; t: number; s: string; id: string }): Promise<Uint8Array> {
    // Convert signature from base64 string to Uint8Array
    const signatureBytes = this._base64ToUint8Array(msg.s);
    
    const meshMessage: MeshMessage = {
      m: msg.m,
      t: msg.t,
      s: signatureBytes,
      id: msg.id
    };
    
    return await this.encodeMessage(meshMessage);
  }

  /**
   * decodeMessageToMinimal(buffer): Decode to minimalist format { m, t, s, id }
   * 
   * @param {Uint8Array} buffer - Binary data to decode
   * @returns {Promise<{ m: string; t: number; s: string; id: string }>} Decoded minimalist message
   */
  async decodeMessageToMinimal(buffer: Uint8Array): Promise<{ m: string; t: number; s: string; id: string }> {
    const meshMessage = await this.decodeMessage(buffer);
    
    // Convert signature from Uint8Array to base64 string
    const signatureBase64 = this._uint8ArrayToBase64(meshMessage.s);
    
    return {
      m: meshMessage.m,
      t: meshMessage.t,
      s: signatureBase64,
      id: meshMessage.id
    };
  }

  /**
   * _base64ToUint8Array(base64): Convert base64 string to Uint8Array
   * @private
   */
  private _base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * _uint8ArrayToBase64(bytes): Convert Uint8Array to base64 string
   * @private
   */
  private _uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * isReady(): Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const serializationService = new SerializationService();
export default serializationService;
