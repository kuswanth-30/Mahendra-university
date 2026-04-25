/**
 * BluetoothTransport - Bluetooth Low Energy (BLE) Integration
 * Bridges Web Bluetooth API with the GossipEngine
 */

import { gossipEngine } from './gossipEngine';

// Web Bluetooth API Type Declarations
declare global {
  interface BluetoothDevice {
    id: string;
    name: string | null;
    gatt: BluetoothRemoteGATTServer | null;
    addEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    value: DataView | null;
    startNotifications(): Promise<void>;
    writeValue(value: BufferSource): Promise<void>;
    addEventListener(type: string, listener: EventListener): void;
  }

  interface Navigator {
    bluetooth: {
      requestDevice(options: any): Promise<BluetoothDevice>;
    };
  }
}

interface BluetoothDeviceInfo {
  id: string;
  name: string | null;
  connected: boolean;
}

class BluetoothTransport {
  private static instance: BluetoothTransport;
  private device: BluetoothDevice | null;
  private server: BluetoothRemoteGATTServer | null;
  private service: BluetoothRemoteGATTService | null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null;
  private isScanning: boolean;
  private connectedPeers: Map<string, BluetoothDevice>;

  private readonly SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
  private readonly CHARACTERISTIC_UUID = '0000feed-0000-1000-8000-00805f9b34fb';

  private constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.isScanning = false;
    this.connectedPeers = new Map();
  }

  static getInstance(): BluetoothTransport {
    if (!BluetoothTransport.instance) {
      BluetoothTransport.instance = new BluetoothTransport();
    }
    return BluetoothTransport.instance;
  }

  /**
   * Check if Web Bluetooth is supported
   */
  isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  /**
   * Scan and connect to nearby mesh nodes
   */
  async scanAndConnect(): Promise<BluetoothDeviceInfo | null> {
    if (!this.isSupported()) {
      console.error('404 FOUND: [BLUETOOTH] Web Bluetooth not supported');
      return null;
    }

    try {
      console.log('404 FOUND: [BLUETOOTH] Scanning for mesh nodes...');
      
      this.device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [this.SERVICE_UUID],
      });

      if (!this.device) {
        console.log('404 FOUND: [BLUETOOTH] No device selected');
        return null;
      }

      console.log(`404 FOUND: [BLUETOOTH] Found device: ${this.device.name || 'Unknown'}`);

      // Connect to device
      await this.connectToDevice(this.device);

      return {
        id: this.device.id,
        name: this.device.name,
        connected: this.device.gatt?.connected || false,
      };

    } catch (error) {
      console.error('404 FOUND: [BLUETOOTH] Scan failed:', error);
      return null;
    }
  }

  /**
   * Connect to a specific Bluetooth device
   */
  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    try {
      this.server = await device.gatt!.connect();
      console.log('404 FOUND: [BLUETOOTH] GATT server connected');

      // Get service
      this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
      
      // Get characteristic
      this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);

      // Start notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', 
        this.handleCharacteristicValueChanged.bind(this));

      // Add to connected peers
      this.connectedPeers.set(device.id, device);

      // Notify gossip engine
      gossipEngine.onPeerConnected(device.id);

      // Listen for disconnection
      device.addEventListener('gattserverdisconnected', () => {
        console.log(`404 FOUND: [BLUETOOTH] Device ${device.id} disconnected`);
        this.handleDisconnection(device.id);
      });

      console.log(`404 FOUND: [BLUETOOTH] Connected to ${device.id}`);

    } catch (error) {
      console.error('404 FOUND: [BLUETOOTH] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Handle incoming data from Bluetooth
   */
  private handleCharacteristicValueChanged(event: Event): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    
    if (!value) return;

    // Decode the received data
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    console.log('404 FOUND: [BLUETOOTH] Data received:', data.substring(0, 100) + '...');

    try {
      const parsedData = JSON.parse(data);
      
      // Pass to gossip engine
      if (this.device) {
        gossipEngine.handleIncomingData(this.device.id, parsedData);
      }
    } catch (error) {
      console.error('404 FOUND: [BLUETOOTH] Failed to parse data:', error);
    }
  }

  /**
   * Send data to connected Bluetooth peer with chunking
   * Protocol: Each chunk has a 4-byte header [chunkIndex, totalChunks, payloadLength]
   */
  async sendData(peerId: string, data: any): Promise<void> {
    const device = this.connectedPeers.get(peerId);
    if (!device) {
      console.error(`404 FOUND: [BLUETOOTH] Peer ${peerId} not connected`);
      return;
    }

    try {
      const encoder = new TextEncoder();
      const jsonData = JSON.stringify(data);
      const encoded = encoder.encode(jsonData);

      // BLE MTU is typically 20-512 bytes. Use conservative 180 bytes for payload
      // to account for 4-byte header: total 184 bytes per packet
      const MAX_PAYLOAD_SIZE = 180;
      const totalChunks = Math.ceil(encoded.length / MAX_PAYLOAD_SIZE);

      console.log(`404 FOUND: [BLUETOOTH] Sending ${encoded.length} bytes in ${totalChunks} chunks to ${peerId}`);

      // Send chunks with delay between each to prevent overwhelming the connection
      for (let i = 0; i < totalChunks; i++) {
        const start = i * MAX_PAYLOAD_SIZE;
        const end = Math.min(start + MAX_PAYLOAD_SIZE, encoded.length);
        const payload = encoded.slice(start, end);

        // Create chunk with header: [chunkIndex (1 byte), totalChunks (1 byte), payloadLength (2 bytes)]
        const header = new Uint8Array(4);
        header[0] = i; // chunk index
        header[1] = totalChunks - 1; // total chunks (0-indexed)
        header[2] = payload.length >> 8; // high byte of length
        header[3] = payload.length & 0xFF; // low byte of length

        // Combine header and payload
        const chunk = new Uint8Array(header.length + payload.length);
        chunk.set(header);
        chunk.set(payload, header.length);

        // Send chunk
        await this.characteristic?.writeValue(chunk.buffer as ArrayBuffer);

        // Small delay between chunks to prevent connection drop
        if (i < totalChunks - 1) {
          await this.delay(50); // 50ms delay between chunks
        }
      }

      console.log(`404 FOUND: [BLUETOOTH] Successfully sent ${totalChunks} chunks to ${peerId}`);

    } catch (error) {
      console.error('404 FOUND: [BLUETOOTH] Send failed:', error);
      throw error;
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send multiple messages with batching and progress tracking
   */
  async sendMessages(peerId: string, messages: any[]): Promise<{ sent: number; failed: number }> {
    const result = { sent: 0, failed: 0 };
    
    // Process in smaller batches to prevent overwhelming
    const BATCH_SIZE = 10;
    const batches = this.createBatches(messages, BATCH_SIZE);

    console.log(`404 FOUND: [BLUETOOTH] Sending ${messages.length} messages in ${batches.length} batches`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const payload = {
          type: 'BATCH_MESSAGES',
          batchIndex: i,
          totalBatches: batches.length,
          messages: batch,
        };

        await this.sendData(peerId, payload);
        result.sent += batch.length;
        
        // Delay between batches
        if (i < batches.length - 1) {
          await this.delay(200); // 200ms between batches
        }
      } catch (error) {
        console.error(`404 FOUND: [BLUETOOTH] Batch ${i} failed:`, error);
        result.failed += batch.length;
      }
    }

    console.log(`404 FOUND: [BLUETOOTH] Transfer complete: ${result.sent} sent, ${result.failed} failed`);
    return result;
  }

  /**
   * Split array into batches
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Handle peer disconnection
   */
  private handleDisconnection(deviceId: string): void {
    this.connectedPeers.delete(deviceId);
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    
    gossipEngine.onPeerDisconnected(deviceId);
  }

  /**
   * Disconnect from a specific peer
   */
  async disconnect(peerId: string): Promise<void> {
    const device = this.connectedPeers.get(peerId);
    if (device && device.gatt?.connected) {
      await device.gatt.disconnect();
    }
    this.handleDisconnection(peerId);
  }

  /**
   * Get list of connected peers
   */
  getConnectedPeers(): BluetoothDeviceInfo[] {
    return Array.from(this.connectedPeers.values()).map(device => ({
      id: device.id,
      name: device.name,
      connected: device.gatt?.connected || false,
    }));
  }

  /**
   * Broadcast to all connected peers
   */
  async broadcast(data: any): Promise<void> {
    const peers = this.getConnectedPeers();
    
    for (const peer of peers) {
      if (peer.connected) {
        await this.sendData(peer.id, data);
      }
    }
  }
}

// Export singleton
export const bluetoothTransport = BluetoothTransport.getInstance();
export default bluetoothTransport;

// Export types
export type { BluetoothDeviceInfo };
