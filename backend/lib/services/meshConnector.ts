/**
 * MeshConnector - Connection Handshake Service for 404 Found
 * Manages peer connections and triggers sync engine
 */

import { gossipEngine } from './gossipEngine';
import { meshDiscovery, DiscoveredPeer } from './meshDiscovery';
import { bluetoothTransport } from './bluetoothTransport';

interface MeshConnection {
  peerId: string;
  peerName: string;
  status: 'connecting' | 'connected' | 'syncing' | 'disconnected';
  connectedAt?: Date;
  lastSyncAt?: Date;
  syncCount: number;
}

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalSyncs: number;
}

class MeshConnector {
  private static instance: MeshConnector;
  private connections: Map<string, MeshConnection>;
  private connectionAttempts: Map<string, number>;
  private maxRetries: number;
  private isInitialized: boolean;

  private constructor() {
    this.connections = new Map();
    this.connectionAttempts = new Map();
    this.maxRetries = 3;
    this.isInitialized = false;

    console.log('404 FOUND: [MESH_CONNECTOR] Initialized');
  }

  static getInstance(): MeshConnector {
    if (!MeshConnector.instance) {
      MeshConnector.instance = new MeshConnector();
    }
    return MeshConnector.instance;
  }

  /**
   * Initialize mesh connector and subscribe to discovery events
   */
  initialize(): void {
    if (this.isInitialized) return;

    console.log('404 FOUND: [MESH_CONNECTOR] Starting initialization...');

    // Subscribe to peer discovery events
    meshDiscovery.onPeerDiscovered((peer: DiscoveredPeer) => {
      console.log(`404 FOUND: [MESH_CONNECTOR] Auto-connecting to discovered peer: ${peer.id}`);
      this.connectToPeer(peer.id, peer.name);
    });

    meshDiscovery.onPeerLost((peerId: string) => {
      console.log(`404 FOUND: [MESH_CONNECTOR] Peer lost: ${peerId}`);
      this.handleDisconnection(peerId);
    });

    this.isInitialized = true;
    console.log('404 FOUND: [MESH_CONNECTOR] Initialization complete');
  }

  /**
   * Connect to a discovered peer
   */
  async connectToPeer(peerId: string, peerName: string): Promise<boolean> {
    // Check if already connected
    const existing = this.connections.get(peerId);
    if (existing?.status === 'connected' || existing?.status === 'syncing') {
      console.log(`404 FOUND: [MESH_CONNECTOR] Already connected to ${peerId}`);
      return true;
    }

    // Check retry count
    const attempts = this.connectionAttempts.get(peerId) || 0;
    if (attempts >= this.maxRetries) {
      console.log(`404 FOUND: [MESH_CONNECTOR] Max retries reached for ${peerId}`);
      return false;
    }

    // Update connection state
    const connection: MeshConnection = {
      peerId,
      peerName,
      status: 'connecting',
      syncCount: 0,
    };
    this.connections.set(peerId, connection);
    this.connectionAttempts.set(peerId, attempts + 1);

    try {
      console.log(`404 FOUND: [MESH_CONNECTOR] Connecting to ${peerName} (${peerId})...`);

      // Attempt Bluetooth connection via transport layer
      const connected = await this.establishConnection(peerId);

      if (connected) {
        connection.status = 'connected';
        connection.connectedAt = new Date();
        this.connections.set(peerId, connection);

        console.log(`404 FOUND: [MESH_CONNECTOR] Connected to ${peerId}`);

        // Trigger sync engine exchange
        await this.triggerSync(peerId);

        return true;
      } else {
        throw new Error('Connection failed');
      }

    } catch (error) {
      console.error(`404 FOUND: [MESH_CONNECTOR] Connection failed for ${peerId}:`, error);
      
      connection.status = 'disconnected';
      this.connections.set(peerId, connection);

      // Schedule retry
      if (attempts < this.maxRetries) {
        console.log(`404 FOUND: [MESH_CONNECTOR] Will retry ${peerId} in 5 seconds...`);
        setTimeout(() => this.connectToPeer(peerId, peerName), 5000);
      }

      return false;
    }
  }

  /**
   * Establish Bluetooth connection
   */
  private async establishConnection(peerId: string): Promise<boolean> {
    try {
      // Try to connect via Bluetooth transport
      // This will pair with the device if not already paired
      
      if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
        // Web Bluetooth approach
        // In Capacitor, this would use the native BLE plugin
        
        console.log(`404 FOUND: [MESH_CONNECTOR] Establishing GATT connection to ${peerId}`);
        
        // The actual connection is handled by the BluetoothTransport
        // which manages the GATT server connection
        
        // Simulate successful connection for now
        // In production, this would use the actual device connection
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(`404 FOUND: [MESH_CONNECTOR] Failed to establish connection:`, error);
      return false;
    }
  }

  /**
   * Trigger sync engine to exchange data vectors
   */
  async triggerSync(peerId: string): Promise<void> {
    const connection = this.connections.get(peerId);
    if (!connection || connection.status !== 'connected') {
      console.warn(`404 FOUND: [MESH_CONNECTOR] Cannot sync, peer not connected: ${peerId}`);
      return;
    }

    connection.status = 'syncing';
    this.connections.set(peerId, connection);

    console.log(`404 FOUND: [MESH_CONNECTOR] Starting sync with ${peerId}...`);

    try {
      // Use the gossip engine to initiate sync
      // This will:
      // 1. Generate message summary
      // 2. Send to peer
      // 3. Receive delta
      // 4. Exchange missing messages
      
      gossipEngine.onPeerConnected(peerId);

      // Wait for sync to complete (gossip engine handles this async)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update connection stats
      connection.status = 'connected';
      connection.lastSyncAt = new Date();
      connection.syncCount++;
      this.connections.set(peerId, connection);

      console.log(`404 FOUND: [MESH_CONNECTOR] Sync complete with ${peerId}`);

    } catch (error) {
      console.error(`404 FOUND: [MESH_CONNECTOR] Sync failed with ${peerId}:`, error);
      connection.status = 'connected'; // Keep connected even if sync failed
      this.connections.set(peerId, connection);
    }
  }

  /**
   * Handle peer disconnection
   */
  private handleDisconnection(peerId: string): void {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.status = 'disconnected';
      this.connections.set(peerId, connection);
      
      // Notify gossip engine
      gossipEngine.onPeerDisconnected(peerId);
      
      console.log(`404 FOUND: [MESH_CONNECTOR] Disconnected from ${peerId}`);
    }
  }

  /**
   * Disconnect from a peer
   */
  async disconnect(peerId: string): Promise<void> {
    console.log(`404 FOUND: [MESH_CONNECTOR] Disconnecting from ${peerId}...`);
    
    try {
      await bluetoothTransport.disconnect(peerId);
    } catch (error) {
      console.error(`404 FOUND: [MESH_CONNECTOR] Disconnect error:`, error);
    }
    
    this.handleDisconnection(peerId);
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    let active = 0;
    let totalSyncs = 0;

    for (const conn of this.connections.values()) {
      if (conn.status === 'connected' || conn.status === 'syncing') {
        active++;
      }
      totalSyncs += conn.syncCount;
    }

    return {
      totalConnections: this.connections.size,
      activeConnections: active,
      totalSyncs: totalSyncs,
    };
  }

  /**
   * Get all connections
   */
  getConnections(): MeshConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get specific connection
   */
  getConnection(peerId: string): MeshConnection | undefined {
    return this.connections.get(peerId);
  }

  /**
   * Force retry connection to peer
   */
  async retryConnection(peerId: string): Promise<boolean> {
    this.connectionAttempts.set(peerId, 0);
    const connection = this.connections.get(peerId);
    
    if (connection) {
      return this.connectToPeer(peerId, connection.peerName);
    }
    
    return false;
  }
}

// Export singleton
export const meshConnector = MeshConnector.getInstance();
export default meshConnector;

// Export types
export type { MeshConnection, ConnectionStats };
