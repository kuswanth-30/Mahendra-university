/**
 * MeshDiscovery - BLE/Wi-Fi Direct Discovery Service for 404 Found
 * Handles peer discovery without internet connectivity
 */

import { gossipEngine } from './gossipEngine';

// Service UUID for 404 Found mesh network
const MESH_SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
const MESH_CHARACTERISTIC_UUID = '0000feed-0000-1000-8000-00805f9b34fb';

// Node advertisement name
const NODE_NAME = '404_Found_Node';

interface DiscoveredPeer {
  id: string;
  name: string;
  rssi?: number;
  lastSeen: Date;
  status: 'discovered' | 'connecting' | 'connected' | 'disconnected';
}

interface DiscoveryOptions {
  scanInterval?: number; // ms between scans
  advertisementInterval?: number; // ms between advertisements
  signalStrengthThreshold?: number; // RSSI threshold
}

class MeshDiscovery {
  private static instance: MeshDiscovery;
  private isAdvertising: boolean;
  private isScanning: boolean;
  private discoveredPeers: Map<string, DiscoveredPeer>;
  private scanIntervalId: NodeJS.Timeout | null;
  private options: DiscoveryOptions;
  private onPeerDiscoveredCallback: ((peer: DiscoveredPeer) => void) | null;
  private onPeerLostCallback: ((peerId: string) => void) | null;

  private constructor() {
    this.isAdvertising = false;
    this.isScanning = false;
    this.discoveredPeers = new Map();
    this.scanIntervalId = null;
    this.options = {
      scanInterval: 5000, // 5 seconds
      advertisementInterval: 1000, // 1 second
      signalStrengthThreshold: -80, // dBm
    };
    this.onPeerDiscoveredCallback = null;
    this.onPeerLostCallback = null;

    console.log('404 FOUND: [MESH_DISCOVERY] Initialized');
  }

  static getInstance(): MeshDiscovery {
    if (!MeshDiscovery.instance) {
      MeshDiscovery.instance = new MeshDiscovery();
    }
    return MeshDiscovery.instance;
  }

  /**
   * Configure discovery options
   */
  configure(options: DiscoveryOptions): void {
    this.options = { ...this.options, ...options };
    console.log('404 FOUND: [MESH_DISCOVERY] Configured:', this.options);
  }

  /**
   * Start advertising as a 404_Found_Node
   * Platform: Android (BLE), iOS (Multipeer Connectivity fallback)
   */
  async startAdvertising(): Promise<void> {
    if (this.isAdvertising) {
      console.log('404 FOUND: [MESH_DISCOVERY] Already advertising');
      return;
    }

    try {
      // Check if running in Capacitor environment
      if (this.isCapacitor()) {
        await this.startCapacitorAdvertising();
      } else {
        // Web Bluetooth API fallback (for testing in browser)
        await this.startWebBluetoothAdvertising();
      }

      this.isAdvertising = true;
      console.log('404 FOUND: [MESH_DISCOVERY] Started advertising as:', NODE_NAME);

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Failed to start advertising:', error);
      throw error;
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) return;

    try {
      if (this.isCapacitor()) {
        // Stop Capacitor advertising
        const { BluetoothLe } = await import('@capacitor-community/bluetooth-le');
        await BluetoothLe.stopAdvertising();
      }

      this.isAdvertising = false;
      console.log('404 FOUND: [MESH_DISCOVERY] Stopped advertising');

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Failed to stop advertising:', error);
    }
  }

  /**
   * Start scanning for other 404_Found_Nodes
   */
  async startScanning(): Promise<void> {
    if (this.isScanning) {
      console.log('404 FOUND: [MESH_DISCOVERY] Already scanning');
      return;
    }

    try {
      this.isScanning = true;
      console.log('404 FOUND: [MESH_DISCOVERY] Started scanning for peers...');

      // Continuous scanning loop
      this.scanLoop();

      // Set up interval for periodic scans
      this.scanIntervalId = setInterval(() => {
        this.scanLoop();
      }, this.options.scanInterval);

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Failed to start scanning:', error);
      this.isScanning = false;
      throw error;
    }
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (!this.isScanning) return;

    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }

    this.isScanning = false;
    console.log('404 FOUND: [MESH_DISCOVERY] Stopped scanning');
  }

  /**
   * Single scan iteration
   */
  private async scanLoop(): Promise<void> {
    try {
      if (this.isCapacitor()) {
        await this.capacitorScan();
      } else {
        await this.webBluetoothScan();
      }

      // Clean up old peers (not seen in 30 seconds)
      this.cleanupStalePeers();

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Scan error:', error);
    }
  }

  /**
   * Capacitor BLE Advertising (Android)
   */
  private async startCapacitorAdvertising(): Promise<void> {
    try {
      const { BluetoothLe } = await import('@capacitor-community/bluetooth-le');

      // Request permissions
      await BluetoothLe.requestLEScan({
        allowDuplicates: false,
      });

      // Start advertising with service UUID
      await BluetoothLe.startAdvertising({
        name: NODE_NAME,
        serviceUuid: MESH_SERVICE_UUID,
        includeDeviceName: true,
        includeTxPowerLevel: true,
      });

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Capacitor advertising failed:', error);
      throw error;
    }
  }

  /**
   * Capacitor BLE Scanning (Android)
   */
  private async capacitorScan(): Promise<void> {
    try {
      const { BluetoothLe } = await import('@capacitor-community/bluetooth-le');

      // Start LE scan
      await BluetoothLe.requestLEScan({
        allowDuplicates: false,
        scanMode: 2, // Low latency mode
      });

      // Listen for scan results
      BluetoothLe.addListener('onScanResult', (result: any) => {
        const deviceName = result.device?.name || result.localName;
        
        if (deviceName?.includes('404_Found_Node')) {
          this.handlePeerDiscovered({
            id: result.device.deviceId,
            name: deviceName,
            rssi: result.rssi,
            lastSeen: new Date(),
            status: 'discovered',
          });
        }
      });

    } catch (error) {
      console.error('404 FOUND: [MESH_DISCOVERY] Capacitor scan error:', error);
    }
  }

  /**
   * Web Bluetooth Advertising (Browser testing fallback)
   */
  private async startWebBluetoothAdvertising(): Promise<void> {
    // Web Bluetooth doesn't support advertising, only scanning
    // For testing, we'll simulate advertising via console
    console.log('404 FOUND: [MESH_DISCOVERY] Web Bluetooth: Advertising not supported, using simulation mode');
    
    // In a real PWA, you could use WebRTC for discovery
    // or rely on the peer being the scanner
  }

  /**
   * Web Bluetooth Scanning (Browser testing fallback)
   */
  private async webBluetoothScan(): Promise<void> {
    try {
      if (!('bluetooth' in navigator)) {
        return;
      }

      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [MESH_SERVICE_UUID],
      });

      if (device.name?.includes('404_Found_Node')) {
        this.handlePeerDiscovered({
          id: device.id,
          name: device.name,
          lastSeen: new Date(),
          status: 'discovered',
        });
      }

    } catch (error) {
      // User cancelled or not supported
    }
  }

  /**
   * iOS Multipeer Connectivity (using Capacitor Community)
   */
  async startMultipeerAdvertising(): Promise<void> {
    // For iOS, we use a different approach via Capacitor plugin
    console.log('404 FOUND: [MESH_DISCOVERY] iOS Multipeer: Using BLE fallback for discovery');
    
    // On iOS, BLE is the primary discovery mechanism
    // Actual mesh networking happens via GossipEngine after connection
    await this.startCapacitorAdvertising();
  }

  /**
   * Handle discovered peer
   */
  private handlePeerDiscovered(peer: DiscoveredPeer): void {
    const existingPeer = this.discoveredPeers.get(peer.id);
    
    if (!existingPeer) {
      // New peer discovered
      console.log(`404 FOUND: [MESH_DISCOVERY] New peer discovered: ${peer.name} (${peer.id})`);
      this.discoveredPeers.set(peer.id, peer);
      
      if (this.onPeerDiscoveredCallback) {
        this.onPeerDiscoveredCallback(peer);
      }

      // Auto-trigger connection via GossipEngine
      gossipEngine.onPeerConnected(peer.id);
      
    } else {
      // Update existing peer
      existingPeer.lastSeen = new Date();
      existingPeer.rssi = peer.rssi;
      this.discoveredPeers.set(peer.id, existingPeer);
    }
  }

  /**
   * Clean up peers not seen recently
   */
  private cleanupStalePeers(): void {
    const now = new Date();
    const staleThreshold = 30000; // 30 seconds

    for (const [id, peer] of this.discoveredPeers) {
      const timeSinceLastSeen = now.getTime() - peer.lastSeen.getTime();
      
      if (timeSinceLastSeen > staleThreshold) {
        console.log(`404 FOUND: [MESH_DISCOVERY] Peer lost: ${peer.name} (${id})`);
        this.discoveredPeers.delete(id);
        
        if (this.onPeerLostCallback) {
          this.onPeerLostCallback(id);
        }

        // Notify gossip engine
        gossipEngine.onPeerDisconnected(id);
      }
    }
  }

  /**
   * Subscribe to peer discovery events
   */
  onPeerDiscovered(callback: (peer: DiscoveredPeer) => void): () => void {
    this.onPeerDiscoveredCallback = callback;
    return () => { this.onPeerDiscoveredCallback = null; };
  }

  onPeerLost(callback: (peerId: string) => void): () => void {
    this.onPeerLostCallback = callback;
    return () => { this.onPeerLostCallback = null; };
  }

  /**
   * Get all discovered peers
   */
  getDiscoveredPeers(): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Check if running in Capacitor native environment
   */
  private isCapacitor(): boolean {
    return typeof (window as any).Capacitor !== 'undefined';
  }

  /**
   * Get discovery status
   */
  getStatus(): {
    isAdvertising: boolean;
    isScanning: boolean;
    peerCount: number;
  } {
    return {
      isAdvertising: this.isAdvertising,
      isScanning: this.isScanning,
      peerCount: this.discoveredPeers.size,
    };
  }
}

// Export singleton
export const meshDiscovery = MeshDiscovery.getInstance();
export default meshDiscovery;

// Export types
export type { DiscoveredPeer, DiscoveryOptions };
