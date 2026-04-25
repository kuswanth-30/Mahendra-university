/**
 * Hardware Bridge Mock - Browser-based development mock
 * 
 * Simulates Bluetooth LE operations for browser development without physical devices.
 * Allows UI iteration without requiring native builds.
 * 
 * Mock implementation of:
 * - discoverPeers(): Simulates scanning for nearby mesh nodes
 * - broadcastMessage(msg): Simulates advertising message to nearby peers
 * - stopAdvertising(): Simulates stopping advertising
 */

/**
 * Peer interface for discovered devices
 */
export interface Peer {
  id: string;
  name?: string;
  rssi?: number;
  timestamp: number;
}

/**
 * Message interface for broadcasting
 */
export interface BroadcastMessage {
  id: string;
  content: string;
  timestamp: number;
  signature?: string;
}

/**
 * Hardware Bridge Mock class
 */
class HardwareBridgeMock {
  private isScanning = false;
  private isAdvertising = false;
  private discoveredPeers = new Map<string, Peer>();
  private scanCallback?: (peer: Peer) => void;
  private scanInterval?: NodeJS.Timeout;
  private advertisingInterval?: NodeJS.Timeout;

  /**
   * Initialize Bluetooth (mock)
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    console.log('[HardwareBridgeMock] Bluetooth initialized (mock)');
    return { success: true };
  }

  /**
   * discoverPeers(): Simulate scanning for nearby mesh nodes
   * 
   * @param {Function} callback - Called when a peer is discovered
   * @param {Object} options - Scan options
   * @returns {Promise<{ success: boolean; error?: string }>}
   */
  async discoverPeers(
    callback?: (peer: Peer) => void,
    options?: { duration?: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isScanning) {
        console.warn('[HardwareBridgeMock] Already scanning');
        return { success: false, error: 'Already scanning' };
      }

      this.scanCallback = callback;
      this.isScanning = true;

      console.log('[HardwareBridgeMock] Starting BLE scan (mock)...');

      // Simulate discovering peers every 2 seconds
      this.scanInterval = setInterval(() => {
        this.simulatePeerDiscovery();
      }, 2000);

      // Auto-stop after duration (default: 30 seconds)
      const duration = options?.duration || 30000;
      setTimeout(() => {
        if (this.isScanning) {
          this.stopScanning();
        }
      }, duration);

      console.log('[HardwareBridgeMock] Scan started (mock)');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridgeMock] Scan failed:', error);
      this.isScanning = false;
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Simulate peer discovery (mock)
   * @private
   */
  private simulatePeerDiscovery(): void {
    // Generate random mock peers
    const mockPeers = [
      { id: 'mock-peer-1', name: 'Node Alpha', rssi: -60 },
      { id: 'mock-peer-2', name: 'Node Beta', rssi: -75 },
      { id: 'mock-peer-3', name: 'Node Gamma', rssi: -55 },
    ];

    // Randomly select a peer to "discover"
    const randomPeer = mockPeers[Math.floor(Math.random() * mockPeers.length)];
    
    const peer: Peer = {
      id: randomPeer.id,
      name: randomPeer.name,
      rssi: randomPeer.rssi + Math.floor(Math.random() * 20) - 10, // Add some variation
      timestamp: Date.now(),
    };

    // Update or add peer
    this.discoveredPeers.set(peer.id, peer);

    // Notify callback
    if (this.scanCallback) {
      this.scanCallback(peer);
    }

    console.log(`[HardwareBridgeMock] Discovered peer (mock): ${peer.name} (${peer.id})`);
  }

  /**
   * stopScanning(): Stop scanning for peers (mock)
   */
  async stopScanning(): Promise<void> {
    try {
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = undefined;
      }
      this.isScanning = false;
      console.log('[HardwareBridgeMock] Scan stopped (mock)');
    } catch (error) {
      console.error('[HardwareBridgeMock] Failed to stop scan:', error);
    }
  }

  /**
   * broadcastMessage(msg): Simulate advertising message to nearby peers
   * 
   * @param {BroadcastMessage} msg - Message to broadcast
   * @returns {Promise<{ success: boolean; error?: string }>}
   */
  async broadcastMessage(msg: BroadcastMessage): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isAdvertising) {
        console.warn('[HardwareBridgeMock] Already advertising');
        return { success: false, error: 'Already advertising' };
      }

      this.isAdvertising = true;

      console.log('[HardwareBridgeMock] Starting advertising (mock)...');
      console.log('[HardwareBridgeMock] Broadcasting message:', msg);

      // Simulate advertising for 60 seconds
      this.advertisingInterval = setInterval(() => {
        console.log('[HardwareBridgeMock] Advertising tick (mock)');
      }, 5000);

      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (this.isAdvertising) {
          this.stopAdvertising();
        }
      }, 60000);

      console.log('[HardwareBridgeMock] Advertising started (mock)');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridgeMock] Advertising failed:', error);
      this.isAdvertising = false;
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * stopAdvertising(): Stop advertising (mock)
   */
  async stopAdvertising(): Promise<void> {
    try {
      if (this.advertisingInterval) {
        clearInterval(this.advertisingInterval);
        this.advertisingInterval = undefined;
      }
      this.isAdvertising = false;
      console.log('[HardwareBridgeMock] Advertising stopped (mock)');
    } catch (error) {
      console.error('[HardwareBridgeMock] Failed to stop advertising:', error);
    }
  }

  /**
   * getDiscoveredPeers(): Get list of discovered peers (mock)
   */
  getDiscoveredPeers(): Peer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * isScanning(): Check if currently scanning (mock)
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  /**
   * isAdvertising(): Check if currently advertising (mock)
   */
  isCurrentlyAdvertising(): boolean {
    return this.isAdvertising;
  }

  /**
   * clearDiscoveredPeers(): Clear discovered peers list (mock)
   */
  clearDiscoveredPeers(): void {
    this.discoveredPeers.clear();
  }
}

export const hardwareBridgeMock = new HardwareBridgeMock();
export default hardwareBridgeMock;
