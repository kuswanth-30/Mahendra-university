/**
 * Hardware Bridge - Capacitor Bluetooth LE Node Discovery
 * 
 * Focused on NODE DISCOVERY ONLY - logs nearby device IDs to console
 * Uses @capacitor-community/bluetooth-le for native Bluetooth access
 * 
 * Features:
 * - initialize() - Request permissions and setup
 * - startDiscovery() - Scan and log nearby device IDs
 * - stopDiscovery() - Stop scanning
 * - onPeerDiscovered - Event handler for new peers
 */

import { BluetoothLe } from '@capacitor-community/bluetooth-le';
import { Device } from '@capacitor/device';

/**
 * Hardware Bridge for native Bluetooth node discovery
 */
class HardwareBridge {
  constructor() {
    this.isInitialized = false;
    this.isScanning = false;
    this.discoveredPeers = new Map(); // deviceId -> peer info
    this.discoveryHandlers = [];
    this.deviceId = null;
    this.platform = null;
  }

  /**
   * Initialize the hardware bridge
   * Requests permissions and sets up event listeners
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initialize() {
    try {
      // Get device info
      const deviceInfo = await Device.getInfo();
      this.deviceId = deviceInfo.uuid || `device-${Date.now()}`;
      this.platform = deviceInfo.platform;

      console.log(`[HardwareBridge] Initializing on ${this.platform}...`);

      // Check if Bluetooth is enabled
      const isEnabled = await BluetoothLe.isEnabled();
      
      if (!isEnabled) {
        // Try to enable Bluetooth
        try {
          await BluetoothLe.enable();
        } catch (e) {
          console.warn('[HardwareBridge] Could not auto-enable Bluetooth:', e);
          return { 
            success: false, 
            error: 'Bluetooth is disabled. Please enable Bluetooth in settings.' 
          };
        }
      }

      // Set up event listeners
      this._setupEventListeners();

      this.isInitialized = true;
      console.log('[HardwareBridge] Initialized successfully');
      return { success: true };

    } catch (error) {
      console.error('[HardwareBridge] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if Bluetooth hardware is available and enabled
   * Exposes checkHardwareStatus() as requested
   * @returns {Promise<{available: boolean, enabled: boolean, error?: string}>}
   */
  async checkHardwareStatus() {
    try {
      const isEnabled = await BluetoothLe.isEnabled();
      return { 
        available: true, 
        enabled: isEnabled.value 
      };
    } catch (error) {
      console.error('[HardwareBridge] Hardware check failed:', error);
      return { available: false, enabled: false, error: error.message };
    }
  }

  /**
   * Request hardware permissions for Bluetooth scanning
   * Exposes requestHardwarePermission() as requested
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async requestHardwarePermission() {
    try {
      // Request location permission (required for Bluetooth on Android)
      const locationPermission = await BluetoothLe.requestLocationPermission();
      console.log('[HardwareBridge] Location permission:', locationPermission);

      // Request Bluetooth permissions
      const bluetoothPermission = await BluetoothLe.requestBluetoothPermission();
      console.log('[HardwareBridge] Bluetooth permission:', bluetoothPermission);

      // Request scan permission
      const scanPermission = await BluetoothLe.requestScanPermission();
      console.log('[HardwareBridge] Scan permission:', scanPermission);

      return { success: true };
    } catch (error) {
      console.error('[HardwareBridge] Permission request failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start scanning for nearby Bluetooth devices in background
   * Exposes startBackgroundScan() as requested
   * @param {Object} options 
   */
  async startBackgroundScan(options = {}) {
    return this.startDiscovery({
      ...options,
      duration: options.duration || 30000 // default 30s for background
    });
  }

  /**
   * scanForPeers(callback) - Interface for scanning with callback
   * Exposes scanForPeers() as requested
   * @param {Function} callback - (peer) => void callback for discovered peers
   * @param {Object} options - Scan options
   * @returns {Promise<{success: boolean, peersFound: number, error?: string}>}
   */
  async scanForPeers(callback, options = {}) {
    // Register the callback as a discovery handler
    if (callback && typeof callback === 'function') {
      this.onPeerDiscovered(callback);
    }

    // Start discovery
    return this.startDiscovery(options);
  }

  /**
   * startAdvertising() - Interface for advertising presence
   * Exposes startAdvertising() as requested
   * @param {Object} options - Advertising options
   * @param {string} [options.serviceUUID] - Service UUID to advertise
   * @param {string} [options.localName] - Local name for advertising
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startAdvertising(options = {}) {
    if (!this.isInitialized) {
      console.error('[HardwareBridge:Advertising] Not initialized');
      return { success: false, error: 'Hardware bridge not initialized' };
    }

    try {
      const { serviceUUID = MESH_SERVICE_UUID, localName = '404Found-Node' } = options;

      console.log(`[HardwareBridge:Advertising] Starting advertising as ${localName}...`);

      // Start advertising
      await BluetoothLe.startAdvertising({
        serviceUUID,
        localName,
      });

      console.log('[HardwareBridge:Advertising] Advertising started successfully');
      return { success: true };

    } catch (error) {
      console.error('[HardwareBridge:Advertising] Failed to start advertising:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * stopAdvertising() - Stop advertising presence
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stopAdvertising() {
    try {
      await BluetoothLe.stopAdvertising();
      console.log('[HardwareBridge:Advertising] Advertising stopped');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridge:Advertising] Failed to stop advertising:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * NODE DISCOVERY - Start scanning for nearby Bluetooth devices
   * Logs device IDs to console for debugging
   * 
   * @param {Object} options - Scan options
   * @param {number} [options.duration=10000] - Scan duration in ms (default 10s)
   * @returns {Promise<{success: boolean, peersFound: number, error?: string}>}
   */
  async startDiscovery(options = {}) {
    if (!this.isInitialized) {
      console.error('[HardwareBridge:Discovery] Not initialized');
      return { success: false, peersFound: 0, error: 'Hardware bridge not initialized' };
    }

    if (this.isScanning) {
      console.log('[HardwareBridge:Discovery] Scan already in progress');
      return { success: false, peersFound: 0, error: 'Scan already in progress' };
    }

    const { duration = 10000 } = options;

    try {
      this.isScanning = true;
      this.discoveredPeers.clear();

      console.log(`[HardwareBridge:Discovery] === STARTING NODE DISCOVERY ===`);
      console.log(`[HardwareBridge:Discovery] Scanning for ${duration}ms...`);

      // Start scanning - no service filter to discover all BLE devices
      await BluetoothLe.startScan({
        allowDuplicates: false,
      });

      // Auto-stop after duration
      setTimeout(async () => {
        if (this.isScanning) {
          await this.stopDiscovery();
        }
      }, duration);

      return { 
        success: true, 
        peersFound: this.discoveredPeers.size 
      };

    } catch (error) {
      this.isScanning = false;
      console.error('[HardwareBridge:Discovery] Scan failed:', error);
      return { success: false, peersFound: 0, error: error.message };
    }
  }

  /**
   * Stop node discovery scan
   * @returns {Promise<{success: boolean}>}
   */
  async stopDiscovery() {
    try {
      if (!this.isScanning) {
        return { success: true };
      }

      await BluetoothLe.stopScan();
      this.isScanning = false;
      
      console.log(`[HardwareBridge:Discovery] === SCAN COMPLETE ===`);
      console.log(`[HardwareBridge:Discovery] Total devices found: ${this.discoveredPeers.size}`);
      
      // Log all discovered device IDs
      if (this.discoveredPeers.size > 0) {
        console.log('[HardwareBridge:Discovery] Discovered Device IDs:');
        for (const [deviceId, peerInfo] of this.discoveredPeers) {
          console.log(`  - ${deviceId} (${peerInfo.name}, ${peerInfo.rssi} dBm)`);
        }
      } else {
        console.log('[HardwareBridge:Discovery] No devices discovered');
      }
      
      return { success: true, peersFound: this.discoveredPeers.size };

    } catch (error) {
      console.error('[HardwareBridge:Discovery] Error stopping scan:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if currently scanning
   * @returns {boolean}
   */
  isCurrentlyScanning() {
    return this.isScanning;
  }

  /**
   * Get list of discovered peers
   * @returns {PeerDevice[]}
   */
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Get list of connected peers
   * @returns {PeerDevice[]}
   */
  getConnectedPeers() {
    return Array.from(this.connectedPeers.values());
  }

  /**
   * Connect to a discovered peer
   * 
   * @param {string} deviceId - Device ID to connect to
   * @param {Object} options - Connection options
   * @param {number} [options.timeout=10000] - Connection timeout in ms
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async connectToPeer(deviceId, options = {}) {
    if (!this.isInitialized) {
      return { success: false, error: 'Hardware bridge not initialized' };
    }

    const { timeout = 10000 } = options;

    try {
      console.log(`[HardwareBridge] Connecting to ${deviceId}...`);

      // Check if already connected
      if (this.connectedPeers.has(deviceId)) {
        return { success: true, alreadyConnected: true };
      }

      // Connect to device
      await BluetoothLe.connect({
        deviceId,
        timeout,
      });

      // Set up data listener for this connection
      await this._setupPeerDataListener(deviceId);

      // Store connection info
      const peerInfo = this.discoveredPeers.get(deviceId) || { id: deviceId, name: 'Unknown' };
      this.connectedPeers.set(deviceId, {
        ...peerInfo,
        isConnected: true,
        connectedAt: Date.now(),
      });

      // Notify handlers
      this.connectionHandlers.forEach(handler => {
        try {
          handler({ deviceId, connected: true });
        } catch (e) {
          console.error('[HardwareBridge] Connection handler error:', e);
        }
      });

      console.log(`[HardwareBridge] Connected to ${deviceId}`);
      return { success: true };

    } catch (error) {
      console.error(`[HardwareBridge] Connection to ${deviceId} failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect from a peer
   * @param {string} deviceId - Device to disconnect
   * @returns {Promise<{success: boolean}>}
   */
  async disconnectFromPeer(deviceId) {
    try {
      await BluetoothLe.disconnect({ deviceId });
      
      this.connectedPeers.delete(deviceId);

      // Notify handlers
      this.connectionHandlers.forEach(handler => {
        try {
          handler({ deviceId, connected: false });
        } catch (e) {
          console.error('[HardwareBridge] Disconnection handler error:', e);
        }
      });

      console.log(`[HardwareBridge] Disconnected from ${deviceId}`);
      return { success: true };

    } catch (error) {
      console.error(`[HardwareBridge] Error disconnecting from ${deviceId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send data to a connected peer
   * 
   * @param {string} deviceId - Target peer device ID
   * @param {any} data - Data to send (will be JSON serialized)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendToPeer(deviceId, data) {
    if (!this.connectedPeers.has(deviceId)) {
      return { success: false, error: 'Not connected to peer' };
    }

    try {
      // Serialize data
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(jsonString);
      
      // Convert to base64 for BLE transmission
      const base64Data = btoa(String.fromCharCode(...bytes));

      // Write to RX characteristic
      await BluetoothLe.write({
        deviceId,
        service: MESH_SERVICE_UUID,
        characteristic: MESH_RX_CHARACTERISTIC,
        value: base64Data,
      });

      console.log(`[HardwareBridge] Sent ${bytes.length} bytes to ${deviceId}`);
      return { success: true, bytesSent: bytes.length };

    } catch (error) {
      console.error(`[HardwareBridge] Failed to send to ${deviceId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Broadcast data to all connected peers
   * @param {any} data - Data to broadcast
   * @returns {Promise<{sent: number, failed: number}>}
   */
  async broadcast(data) {
    const connectedPeers = Array.from(this.connectedPeers.keys());
    let sent = 0;
    let failed = 0;

    await Promise.all(
      connectedPeers.map(async (deviceId) => {
        const result = await this.sendToPeer(deviceId, data);
        if (result.success) sent++;
        else failed++;
      })
    );

    console.log(`[HardwareBridge] Broadcast: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  /**
   * Register peer discovery handler
   * @param {Function} handler - (peer: PeerDevice) => void
   */
  onPeerDiscovered(handler) {
    this.discoveryHandlers.push(handler);
  }

  /**
   * Register data received handler
   * @param {Function} handler - (deviceId: string, data: any) => void
   */
  onDataReceived(handler) {
    this.dataHandlers.push(handler);
  }

  /**
   * Register connection/disconnection handler
   * @param {Function} handler - ({ deviceId: string, connected: boolean }) => void
   */
  onConnectionChange(handler) {
    this.connectionHandlers.push(handler);
  }

  /**
   * Remove all handlers
   */
  removeAllHandlers() {
    this.discoveryHandlers = [];
    this.dataHandlers = [];
    this.connectionHandlers = [];
  }

  /**
   * Get Bluetooth adapter state
   * @returns {Promise<{isEnabled: boolean, isScanning: boolean, connectedCount: number}>}
   */
  async getState() {
    const isEnabled = await BluetoothLe.isEnabled().catch(() => false);
    
    return {
      isEnabled,
      isScanning: this.isScanning,
      connectedCount: this.connectedPeers.size,
      discoveredCount: this.discoveredPeers.size,
    };
  }

  /**
   * Request Bluetooth permissions (explicit permission request)
   * @returns {Promise<{granted: boolean, error?: string}>}
   */
  async requestPermissions() {
    try {
      // This will trigger the permission dialogs on both platforms
      await BluetoothLe.requestLEScan({
        services: [MESH_SERVICE_UUID],
      });
      
      // Stop the scan immediately (we just wanted the permission dialog)
      await BluetoothLe.stopLEScan();
      
      return { granted: true };
    } catch (error) {
      console.error('[HardwareBridge] Permission request failed:', error);
      return { granted: false, error: error.message };
    }
  }

  // Private methods

  /**
   * Set up BLE event listeners - NODE DISCOVERY ONLY
   * Logs device IDs to console when discovered
   * @private
   */
  _setupEventListeners() {
    // Listen for scan results - LOG DEVICE IDs
    BluetoothLe.addListener('onScanResult', (result) => {
      const { device, rssi } = result;
      
      if (!device) return;

      const peerInfo = {
        id: device.deviceId,
        name: device.name || 'Unknown Device',
        rssi: rssi,
        discoveredAt: Date.now(),
      };

      // Store in discovered peers map
      this.discoveredPeers.set(device.deviceId, peerInfo);

      // LOG TO CONSOLE - Node Discovery
      console.log(`[HardwareBridge:Discovery] >>> NODE FOUND <<<`);
      console.log(`[HardwareBridge:Discovery] Device ID: ${device.deviceId}`);
      console.log(`[HardwareBridge:Discovery] Name: ${device.name || 'Unknown'}`);
      console.log(`[HardwareBridge:Discovery] RSSI: ${rssi} dBm`);
      console.log(`[HardwareBridge:Discovery] Total discovered: ${this.discoveredPeers.size}`);

      // Notify discovery handlers
      this.discoveryHandlers.forEach(handler => {
        try {
          handler(peerInfo);
        } catch (e) {
          console.error('[HardwareBridge:Discovery] Handler error:', e);
        }
      });
    });

    // Listen for scan start
    BluetoothLe.addListener('onScanStart', () => {
      console.log('[HardwareBridge:Discovery] BLE scan started');
    });

    // Listen for scan stop
    BluetoothLe.addListener('onScanStop', () => {
      console.log('[HardwareBridge:Discovery] BLE scan stopped');
      this.isScanning = false;
    });
  }

  /**
   * Set up data listener for a specific peer connection
   * @private
   */
  async _setupPeerDataListener(deviceId) {
    try {
      // Start notifications on TX characteristic
      await BluetoothLe.startNotifications({
        deviceId,
        service: MESH_SERVICE_UUID,
        characteristic: MESH_TX_CHARACTERISTIC,
      });

      // Listen for notifications
      BluetoothLe.addListener('onNotification', (event) => {
        if (event.deviceId === deviceId) {
          this._handleIncomingData(deviceId, event.value);
        }
      });

    } catch (error) {
      console.error(`[HardwareBridge] Failed to setup data listener for ${deviceId}:`, error);
    }
  }

  /**
   * Handle incoming data from peer
   * @private
   */
  _handleIncomingData(deviceId, base64Data) {
    try {
      // Decode base64
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Parse JSON
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(bytes);
      const data = JSON.parse(jsonString);

      // Update peer last seen
      const peer = this.connectedPeers.get(deviceId);
      if (peer) {
        peer.lastSeen = Date.now();
      }

      // Notify data handlers
      this.dataHandlers.forEach(handler => {
        try {
          handler(deviceId, data);
        } catch (e) {
          console.error('[HardwareBridge] Data handler error:', e);
        }
      });

      console.log(`[HardwareBridge] Received data from ${deviceId}: ${jsonString.slice(0, 100)}...`);

    } catch (error) {
      console.error(`[HardwareBridge] Failed to parse data from ${deviceId}:`, error);
    }
  }
}

// Export singleton
export const hardwareBridge = new HardwareBridge();
export default hardwareBridge;
export { HardwareBridge };
