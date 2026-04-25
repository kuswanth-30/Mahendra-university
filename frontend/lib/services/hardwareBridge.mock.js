/**
 * Hardware Bridge Mock - Browser Testing without Real Hardware
 * 
 * Simulates Bluetooth LE functionality for UI testing in a browser environment.
 * Uses setTimeout to simulate async operations and random peer generation.
 * 
 * This allows testing the mesh UI without requiring native Bluetooth hardware.
 */

class HardwareBridgeMock {
  constructor() {
    this.isInitialized = false;
    this.isScanning = false;
    this.isAdvertising = false;
    this.discoveredPeers = new Map();
    this.discoveryHandlers = [];
    this.connectionHandlers = [];
    this.dataHandlers = [];
    this.deviceId = `mock-device-${Date.now()}`;
    this.platform = 'web';
    this.mockPeers = [
      { id: 'mock-peer-1', name: 'Mock Node Alpha', rssi: -65 },
      { id: 'mock-peer-2', name: 'Mock Node Beta', rssi: -72 },
      { id: 'mock-peer-3', name: 'Mock Node Gamma', rssi: -58 },
    ];
  }

  /**
   * Initialize the mock hardware bridge
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initialize() {
    console.log('[HardwareBridgeMock] Initializing mock hardware bridge...');
    
    // Simulate initialization delay
    await this._delay(100);
    
    this.isInitialized = true;
    console.log('[HardwareBridgeMock] Mock initialized successfully');
    return { success: true };
  }

  /**
   * Check if Bluetooth hardware is available and enabled
   * @returns {Promise<{available: boolean, enabled: boolean, error?: string}>}
   */
  async checkHardwareStatus() {
    await this._delay(50);
    return { 
      available: true, 
      enabled: true 
    };
  }

  /**
   * Request hardware permissions for Bluetooth scanning
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async requestHardwarePermission() {
    console.log('[HardwareBridgeMock] Requesting mock permissions...');
    await this._delay(100);
    return { success: true };
  }

  /**
   * Start scanning for nearby Bluetooth devices in background
   * @param {Object} options 
   */
  async startBackgroundScan(options = {}) {
    return this.startDiscovery({
      ...options,
      duration: options.duration || 30000
    });
  }

  /**
   * scanForPeers(callback) - Interface for scanning with callback
   * @param {Function} callback - (peer) => void callback for discovered peers
   * @param {Object} options - Scan options
   * @returns {Promise<{success: boolean, peersFound: number, error?: string}>}
   */
  async scanForPeers(callback, options = {}) {
    if (callback && typeof callback === 'function') {
      this.onPeerDiscovered(callback);
    }
    return this.startDiscovery(options);
  }

  /**
   * startAdvertising() - Interface for advertising presence
   * @param {Object} options - Advertising options
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startAdvertising(options = {}) {
    if (!this.isInitialized) {
      return { success: false, error: 'Hardware bridge not initialized' };
    }

    const { localName = '404Found-Node-Mock' } = options;

    console.log(`[HardwareBridgeMock] Starting mock advertising as ${localName}...`);
    await this._delay(100);
    
    this.isAdvertising = true;
    console.log('[HardwareBridgeMock] Mock advertising started');
    return { success: true };
  }

  /**
   * stopAdvertising() - Stop advertising presence
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stopAdvertising() {
    await this._delay(50);
    this.isAdvertising = false;
    console.log('[HardwareBridgeMock] Mock advertising stopped');
    return { success: true };
  }

  /**
   * Start scanning for nearby Bluetooth devices
   * Simulates discovering mock peers
   * @param {Object} options - Scan options
   * @param {number} [options.duration=10000] - Scan duration in ms
   * @returns {Promise<{success: boolean, peersFound: number, error?: string}>}
   */
  async startDiscovery(options = {}) {
    if (!this.isInitialized) {
      return { success: false, peersFound: 0, error: 'Hardware bridge not initialized' };
    }

    if (this.isScanning) {
      return { success: false, peersFound: 0, error: 'Scan already in progress' };
    }

    const { duration = 10000 } = options;

    try {
      this.isScanning = true;
      this.discoveredPeers.clear();

      console.log(`[HardwareBridgeMock] === STARTING MOCK NODE DISCOVERY ===`);
      console.log(`[HardwareBridgeMock] Scanning for ${duration}ms...`);

      // Simulate discovering peers over time
      for (const peer of this.mockPeers) {
        await this._delay(500 + Math.random() * 1000); // Random delay between discoveries
        
        const peerInfo = {
          ...peer,
          discoveredAt: Date.now(),
        };

        this.discoveredPeers.set(peer.id, peerInfo);

        console.log(`[HardwareBridgeMock] >>> MOCK NODE FOUND <<<`);
        console.log(`[HardwareBridgeMock] Device ID: ${peer.id}`);
        console.log(`[HardwareBridgeMock] Name: ${peer.name}`);
        console.log(`[HardwareBridgeMock] RSSI: ${peer.rssi} dBm`);

        // Notify discovery handlers
        this.discoveryHandlers.forEach(handler => {
          try {
            handler(peerInfo);
          } catch (e) {
            console.error('[HardwareBridgeMock] Handler error:', e);
          }
        });
      }

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
      console.error('[HardwareBridgeMock] Scan failed:', error);
      return { success: false, peersFound: 0, error: error.message };
    }
  }

  /**
   * Stop node discovery scan
   * @returns {Promise<{success: boolean}>}
   */
  async stopDiscovery() {
    await this._delay(50);
    this.isScanning = false;
    
    console.log(`[HardwareBridgeMock] === MOCK SCAN COMPLETE ===`);
    console.log(`[HardwareBridgeMock] Total devices found: ${this.discoveredPeers.size}`);
    
    return { success: true, peersFound: this.discoveredPeers.size };
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
    await this._delay(50);
    return {
      isEnabled: true,
      isScanning: this.isScanning,
      isAdvertising: this.isAdvertising,
      connectedCount: 0,
      discoveredCount: this.discoveredPeers.size,
    };
  }

  /**
   * Helper: Simulate async delay
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const hardwareBridgeMock = new HardwareBridgeMock();
export default hardwareBridgeMock;
export { HardwareBridgeMock };
