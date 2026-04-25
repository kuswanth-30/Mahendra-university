/**
 * BeaconMesh Transport Layer - Hardware Abstraction Layer
 * 
 * Defines a generic TransportInterface with broadcast(data) and onReceive(callback).
 * Implements a mock adapter for testing gossip logic between browser tabs using BroadcastChannel API.
 */

/**
 * Transport Interface - Generic interface for transport protocols
 */
class TransportInterface {
  /**
   * broadcast(data): Broadcast data to all peers
   * @param {Uint8Array|string} data - Data to broadcast
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async broadcast(data) {
    throw new Error('broadcast() must be implemented by subclass');
  }

  /**
   * onReceive(callback): Register callback for receiving data
   * @param {Function} callback - Callback function with data as parameter
   */
  onReceive(callback) {
    throw new Error('onReceive() must be implemented by subclass');
  }

  /**
   * start(): Start the transport
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async start() {
    throw new Error('start() must be implemented by subclass');
  }

  /**
   * stop(): Stop the transport
   * @returns {Promise<void>}
   */
  async stop() {
    throw new Error('stop() must be implemented by subclass');
  }
}

/**
 * Mock Transport Adapter - Uses BroadcastChannel API for browser tab testing
 * Allows testing gossip logic between browser tabs before building native Bluetooth/Capacitor layer
 */
class MockTransportAdapter extends TransportInterface {
  constructor(channelName = 'beaconmesh-mock-transport') {
    super();
    this.channelName = channelName;
    this.broadcastChannel = null;
    this.receiveCallback = null;
    this.isStarted = false;
  }

  /**
   * start(): Start the mock transport
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async start() {
    try {
      if (this.isStarted) {
        console.warn('[MockTransport] Already started');
        return { success: false, error: 'Already started' };
      }

      // Create BroadcastChannel for inter-tab communication
      this.broadcastChannel = new BroadcastChannel(this.channelName);
      
      // Listen for incoming messages
      this.broadcastChannel.onmessage = (event) => {
        this._handleReceive(event.data);
      };

      this.isStarted = true;
      console.log(`[MockTransport] Started on channel: ${this.channelName}`);
      return { success: true };
    } catch (error) {
      console.error('[MockTransport] Failed to start:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * stop(): Stop the mock transport
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.close();
        this.broadcastChannel = null;
      }
      this.isStarted = false;
      console.log('[MockTransport] Stopped');
    } catch (error) {
      console.error('[MockTransport] Failed to stop:', error);
    }
  }

  /**
   * broadcast(data): Broadcast data to all peers (browser tabs)
   * @param {Uint8Array|string} data - Data to broadcast
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async broadcast(data) {
    try {
      if (!this.isStarted) {
        return { success: false, error: 'Transport not started' };
      }

      if (!this.broadcastChannel) {
        return { success: false, error: 'BroadcastChannel not initialized' };
      }

      // Broadcast the data
      this.broadcastChannel.postMessage({
        data: data,
        timestamp: Date.now(),
        source: 'mock-transport'
      });

      console.log('[MockTransport] Data broadcasted');
      return { success: true };
    } catch (error) {
      console.error('[MockTransport] Broadcast failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * onReceive(callback): Register callback for receiving data
   * @param {Function} callback - Callback function with data as parameter
   */
  onReceive(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.receiveCallback = callback;
  }

  /**
   * _handleReceive(data): Handle incoming data
   * @private
   */
  _handleReceive(message) {
    if (this.receiveCallback) {
      try {
        this.receiveCallback(message.data);
      } catch (error) {
        console.error('[MockTransport] Callback error:', error);
      }
    }
  }

  /**
   * isCurrentlyStarted(): Check if transport is started
   */
  isCurrentlyStarted() {
    return this.isStarted;
  }
}

// Export singleton instance
export const mockTransport = new MockTransportAdapter();
export { TransportInterface, MockTransportAdapter };
export default mockTransport;
