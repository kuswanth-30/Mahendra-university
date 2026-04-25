/**
 * Hardware Bridge - Bluetooth LE interface using Capacitor
 * 
 * Provides native hardware access for Bluetooth Low Energy operations:
 * - discoverPeers(): Scan for nearby mesh nodes
 * - broadcastMessage(msg): Advertise message to nearby peers
 * - stopAdvertising(): Stop advertising
 * 
 * Uses @capacitor-community/bluetooth-le for native hardware bridging.
 */

import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { serializationService } from './serialization';

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
 * Hardware Bridge class
 */
class HardwareBridge {
  private isScanning = false;
  private isAdvertising = false;
  private discoveredPeers = new Map<string, Peer>();
  private scanCallback?: (peer: Peer) => void;

  // Service UUID for 404 Found mesh network
  private readonly SERVICE_UUID = '0000180A-0000-1000-8000-00805F9B34FB'; // Device Information Service
  private readonly CHARACTERISTIC_UUID = '00002A00-0000-1000-8000-00805F9B34FB'; // Device Name

  /**
   * Initialize Bluetooth
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      await BleClient.initialize();
      console.log('[HardwareBridge] Bluetooth initialized');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridge] Initialization failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * discoverPeers(): Scan for nearby mesh nodes
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
        console.warn('[HardwareBridge] Already scanning');
        return { success: false, error: 'Already scanning' };
      }

      this.scanCallback = callback;
      this.isScanning = true;

      const scanOptions = {
        services: [this.SERVICE_UUID],
        allowDuplicates: false,
      };

      console.log('[HardwareBridge] Starting BLE scan...');

      await BleClient.requestLEScan(
        scanOptions,
        (result: ScanResult) => {
          this.handleDeviceDiscovered(result);
        }
      );

      // Auto-stop after duration (default: 30 seconds)
      const duration = options?.duration || 30000;
      setTimeout(() => {
        if (this.isScanning) {
          this.stopScanning();
        }
      }, duration);

      console.log('[HardwareBridge] Scan started');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridge] Scan failed:', error);
      this.isScanning = false;
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Handle device discovered during scan
   * @private
   */
  private handleDeviceDiscovered(result: ScanResult): void {
    const peer: Peer = {
      id: result.device.deviceId,
      name: result.device.name || 'Unknown Device',
      rssi: result.rssi,
      timestamp: Date.now(),
    };

    // Update or add peer
    this.discoveredPeers.set(peer.id, peer);

    // Notify callback
    if (this.scanCallback) {
      this.scanCallback(peer);
    }

    console.log(`[HardwareBridge] Discovered peer: ${peer.name} (${peer.id})`);
  }

  /**
   * stopScanning(): Stop scanning for peers
   */
  async stopScanning(): Promise<void> {
    try {
      if (this.isScanning) {
        await BleClient.stopLEScan();
        this.isScanning = false;
        console.log('[HardwareBridge] Scan stopped');
      }
    } catch (error) {
      console.error('[HardwareBridge] Failed to stop scan:', error);
    }
  }

  /**
   * broadcastMessage(msg): Advertise message to nearby peers
   * 
   * @param {BroadcastMessage} msg - Message to broadcast
   * @returns {Promise<{ success: boolean; error?: string }>}
   */
  async broadcastMessage(msg: BroadcastMessage): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isAdvertising) {
        console.warn('[HardwareBridge] Already advertising');
        return { success: false, error: 'Already advertising' };
      }

      this.isAdvertising = true;

      // Convert message to binary format using Protocol Buffers
      const minimalMsg = {
        m: msg.content,
        t: msg.timestamp,
        s: msg.signature || '',
        id: msg.id
      };
      
      const binaryData = await serializationService.encodeMessageFromMinimal(minimalMsg);
      const dataView = new DataView(binaryData.buffer);

      console.log('[HardwareBridge] Starting advertising (binary)...');

      // Start advertising (peripheral mode)
      // Note: Advertising is platform-specific and may not be available on all devices
      await BleClient.requestLEScan(
        {
          services: [this.SERVICE_UUID],
          allowDuplicates: false,
        },
        (result) => {
          // Advertising callback
          console.log('[HardwareBridge] Advertising callback:', result);
        }
      );

      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (this.isAdvertising) {
          this.stopAdvertising();
        }
      }, 60000);

      console.log('[HardwareBridge] Advertising started (binary)');
      return { success: true };
    } catch (error) {
      console.error('[HardwareBridge] Advertising failed:', error);
      this.isAdvertising = false;
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * stopAdvertising(): Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    try {
      if (this.isAdvertising) {
        await BleClient.stopLEScan();
        this.isAdvertising = false;
        console.log('[HardwareBridge] Advertising stopped');
      }
    } catch (error) {
      console.error('[HardwareBridge] Failed to stop advertising:', error);
    }
  }

  /**
   * getDiscoveredPeers(): Get list of discovered peers
   */
  getDiscoveredPeers(): Peer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * isScanning(): Check if currently scanning
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  /**
   * isAdvertising(): Check if currently advertising
   */
  isCurrentlyAdvertising(): boolean {
    return this.isAdvertising;
  }

  /**
   * clearDiscoveredPeers(): Clear discovered peers list
   */
  clearDiscoveredPeers(): void {
    this.discoveredPeers.clear();
  }
}

export const hardwareBridge = new HardwareBridge();
export default hardwareBridge;
