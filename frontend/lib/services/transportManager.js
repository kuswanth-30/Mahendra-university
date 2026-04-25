/**
 * TransportManager - Abstraction layer for network transport protocols
 * 
 * Provides a standard interface for discovery and data transfer across different
 * transport protocols (Bluetooth LE, WebRTC, etc.). The GossipSyncEngine communicates
 * only with this interface, not with hardware directly.
 * 
 * Standard Interface:
 * - startDiscovery(): Start discovering peers
 * - onPeerDiscovered(callback): Register callback for peer discovery events
 * - sendData(peerId, buffer): Send data to a specific peer
 * - stopDiscovery(): Stop discovering peers
 */

import { BluetoothLEAdapter } from './adapters/bluetoothLEAdapter';
import { WebRTCAdapter } from './adapters/webrtcAdapter';

/**
 * Transport Manager class
 */
class TransportManager {
  constructor() {
    this.adapters = new Map();
    this.activeAdapter = null;
    this.peerDiscoveredCallbacks = new Set();
    this.isDiscovering = false;
  }

  /**
   * Register a transport adapter
   * @param {string} name - Adapter name (e.g., 'ble', 'webrtc')
   * @param {Object} adapter - Adapter instance implementing the transport interface
   */
  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
    console.log(`[TransportManager] Registered adapter: ${name}`);
  }

  /**
   * Set the active transport adapter
   * @param {string} name - Adapter name to activate
   */
  setActiveAdapter(name) {
    if (!this.adapters.has(name)) {
      throw new Error(`Adapter ${name} not registered`);
    }
    this.activeAdapter = this.adapters.get(name);
    console.log(`[TransportManager] Active adapter set to: ${name}`);
  }

  /**
   * Get the active adapter
   */
  getActiveAdapter() {
    return this.activeAdapter;
  }

  /**
   * startDiscovery(): Start discovering peers using the active adapter
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startDiscovery() {
    if (!this.activeAdapter) {
      throw new Error('No active adapter set');
    }

    if (this.isDiscovering) {
      console.warn('[TransportManager] Already discovering');
      return { success: false, error: 'Already discovering' };
    }

    try {
      this.isDiscovering = true;
      const result = await this.activeAdapter.startDiscovery();
      
      if (result.success) {
        // Set up peer discovery callback on the adapter
        this.activeAdapter.onPeerDiscovered((peer) => {
          this._notifyPeerDiscovered(peer);
        });
      }

      return result;
    } catch (error) {
      this.isDiscovering = false;
      console.error('[TransportManager] Discovery failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * stopDiscovery(): Stop discovering peers
   * @returns {Promise<void>}
   */
  async stopDiscovery() {
    if (!this.activeAdapter || !this.isDiscovering) {
      return;
    }

    try {
      await this.activeAdapter.stopDiscovery();
      this.isDiscovering = false;
      console.log('[TransportManager] Discovery stopped');
    } catch (error) {
      console.error('[TransportManager] Failed to stop discovery:', error);
    }
  }

  /**
   * onPeerDiscovered(callback): Register callback for peer discovery events
   * @param {Function} callback - Callback function with peer object as parameter
   */
  onPeerDiscovered(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.peerDiscoveredCallbacks.add(callback);
  }

  /**
   * Remove peer discovery callback
   * @param {Function} callback - Callback function to remove
   */
  removePeerDiscoveredCallback(callback) {
    this.peerDiscoveredCallbacks.delete(callback);
  }

  /**
   * _notifyPeerDiscovered(peer): Notify all registered callbacks
   * @private
   */
  _notifyPeerDiscovered(peer) {
    for (const callback of this.peerDiscoveredCallbacks) {
      try {
        callback(peer);
      } catch (error) {
        console.error('[TransportManager] Callback error:', error);
      }
    }
  }

  /**
   * sendData(peerId, buffer): Send data to a specific peer
   * @param {string} peerId - Peer identifier
   * @param {Uint8Array} buffer - Data to send
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendData(peerId, buffer) {
    if (!this.activeAdapter) {
      throw new Error('No active adapter set');
    }

    if (!this.activeAdapter.sendData) {
      throw new Error('Active adapter does not support sending data');
    }

    try {
      return await this.activeAdapter.sendData(peerId, buffer);
    } catch (error) {
      console.error('[TransportManager] Send data failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * isCurrentlyDiscovering(): Check if currently discovering
   */
  isCurrentlyDiscovering() {
    return this.isDiscovering;
  }

  /**
   * getAvailableAdapters(): Get list of registered adapter names
   */
  getAvailableAdapters() {
    return Array.from(this.adapters.keys());
  }
}

// Create singleton instance
const transportManager = new TransportManager();

// Register default adapters
const bleAdapter = new BluetoothLEAdapter();
const webrtcAdapter = new WebRTCAdapter();

transportManager.registerAdapter('ble', bleAdapter);
transportManager.registerAdapter('webrtc', webrtcAdapter);

// Set default adapter (BLE for mobile, WebRTC for browser testing)
if (typeof window !== 'undefined' && window.Capacitor) {
  // Running in Capacitor (mobile) - use BLE
  transportManager.setActiveAdapter('ble');
} else {
  // Running in browser - use WebRTC for local testing
  transportManager.setActiveAdapter('webrtc');
}

export { transportManager };
export default transportManager;
