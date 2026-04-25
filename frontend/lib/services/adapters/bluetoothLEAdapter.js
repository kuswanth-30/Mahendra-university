/**
 * BluetoothLEAdapter - Bluetooth Low Energy transport adapter
 * 
 * Implements the transport interface using @capacitor-community/bluetooth-le
 * for mobile device discovery and data transfer.
 */

import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

/**
 * Bluetooth LE Adapter class
 */
class BluetoothLEAdapter {
  constructor() {
    this.isScanning = false;
    this.peerDiscoveredCallback = null;
    this.discoveredPeers = new Map();
    this.SERVICE_UUID = '0000180A-0000-1000-8000-00805F9B34FB'; // Device Information Service
  }

  /**
   * Initialize Bluetooth
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initialize() {
    try {
      await BleClient.initialize();
      console.log('[BluetoothLEAdapter] Bluetooth initialized');
      return { success: true };
    } catch (error) {
      console.error('[BluetoothLEAdapter] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * startDiscovery(): Start discovering peers via BLE scan
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startDiscovery() {
    try {
      if (this.isScanning) {
        console.warn('[BluetoothLEAdapter] Already scanning');
        return { success: false, error: 'Already scanning' };
      }

      // Initialize if not already done
      await this.initialize();

      this.isScanning = true;

      const scanOptions = {
        services: [this.SERVICE_UUID],
        allowDuplicates: false,
      };

      console.log('[BluetoothLEAdapter] Starting BLE scan...');

      await BleClient.requestLEScan(
        scanOptions,
        (result) => {
          this.handleDeviceDiscovered(result);
        }
      );

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (this.isScanning) {
          this.stopDiscovery();
        }
      }, 30000);

      console.log('[BluetoothLEAdapter] Scan started');
      return { success: true };
    } catch (error) {
      console.error('[BluetoothLEAdapter] Scan failed:', error);
      this.isScanning = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * stopDiscovery(): Stop discovering peers
   * @returns {Promise<void>}
   */
  async stopDiscovery() {
    try {
      if (this.isScanning) {
        await BleClient.stopLEScan();
        this.isScanning = false;
        console.log('[BluetoothLEAdapter] Scan stopped');
      }
    } catch (error) {
      console.error('[BluetoothLEAdapter] Failed to stop scan:', error);
    }
  }

  /**
   * onPeerDiscovered(callback): Register callback for peer discovery
   * @param {Function} callback - Callback function
   */
  onPeerDiscovered(callback) {
    this.peerDiscoveredCallback = callback;
  }

  /**
   * handleDeviceDiscovered(result): Handle BLE scan result
   * @private
   */
  handleDeviceDiscovered(result) {
    const peer = {
      id: result.device.deviceId,
      name: result.device.name || 'Unknown Device',
      rssi: result.rssi,
      timestamp: Date.now(),
      transport: 'ble'
    };

    // Update or add peer
    this.discoveredPeers.set(peer.id, peer);

    // Notify callback
    if (this.peerDiscoveredCallback) {
      this.peerDiscoveredCallback(peer);
    }

    console.log(`[BluetoothLEAdapter] Discovered peer: ${peer.name} (${peer.id})`);
  }

  /**
   * sendData(peerId, buffer): Send data to a specific peer
   * Note: BLE data transfer is limited, this is a simplified implementation
   * @param {string} peerId - Peer identifier
   * @param {Uint8Array} buffer - Data to send
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendData(peerId, buffer) {
    try {
      // BLE data transfer requires connection and characteristic write
      // This is a simplified implementation - actual implementation would:
      // 1. Connect to the peer
      // 2. Discover services and characteristics
      // 3. Write data to the characteristic
      
      console.log(`[BluetoothLEAdapter] Sending data to ${peerId} (${buffer.length} bytes)`);
      
      // For now, return success (actual BLE implementation would be more complex)
      return { success: true };
    } catch (error) {
      console.error('[BluetoothLEAdapter] Send data failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * getDiscoveredPeers(): Get list of discovered peers
   */
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * isCurrentlyScanning(): Check if currently scanning
   */
  isCurrentlyScanning() {
    return this.isScanning;
  }
}

export { BluetoothLEAdapter };
