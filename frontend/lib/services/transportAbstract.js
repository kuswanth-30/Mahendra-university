/**
 * TransportAbstraction - Unified transport layer for 404 Found Mesh
 * 
 * Provides a common interface over multiple transport mechanisms:
 * - LibP2P (WebRTC/WebSockets) - Primary transport
 * - Bluetooth Low Energy (Capacitor plugin) - Fallback for offline/P2P
 * 
 * Automatically falls back to Bluetooth when LibP2P is unavailable or fails.
 */

import { BluetoothLe } from '@capacitor-community/bluetooth-le';
import { Device } from '@capacitor/device';

/**
 * Transport interface types
 * @typedef {'libp2p' | 'bluetooth' | 'none'} TransportType
 */

/**
 * Peer connection interface
 * @typedef {Object} MeshPeer
 * @property {string} id - Peer identifier
 * @property {TransportType} transport - Transport mechanism used
 * @property {any} rawConnection - Underlying connection object
 * @property {Function} send - Send data to peer
 * @property {Function} close - Close connection
 * @property {number} lastSeen - Timestamp of last activity
 * @property {boolean} isConnected - Connection status
 */

/**
 * Transport abstraction layer
 * Manages fallback between LibP2P and Bluetooth transports
 */
class TransportAbstraction {
  constructor() {
    this.activeTransport = 'none';
    this.libp2pNode = null;
    this.isBluetoothAvailable = false;
    this.peers = new Map(); // peerId -> MeshPeer
    this.messageHandlers = []; // Callbacks for incoming messages
    this.discoveryHandlers = []; // Callbacks for peer discovery
    this.connectionHandlers = []; // Callbacks for connection events
    this.fallbackEnabled = true;
    this.deviceId = null;
  }

  /**
   * Initialize the transport layer
   * Attempts LibP2P first, falls back to Bluetooth if needed
   * @returns {Promise<{success: boolean, transport: TransportType, error?: string}>}
   */
  async initialize() {
    try {
      // Get device info for unique ID
      const deviceInfo = await Device.getInfo();
      this.deviceId = deviceInfo.uuid || `device-${Date.now()}`;

      // Try LibP2P first
      console.log('[Transport] Attempting LibP2P initialization...');
      const libp2pResult = await this._initLibP2P();

      if (libp2pResult.success) {
        this.activeTransport = 'libp2p';
        this.libp2pNode = libp2pResult.node;
        console.log('[Transport] LibP2P initialized successfully');
        return { success: true, transport: 'libp2p' };
      }

      // Fallback to Bluetooth
      if (this.fallbackEnabled) {
        console.log('[Transport] LibP2P failed, attempting Bluetooth fallback...');
        const bleResult = await this._initBluetooth();

        if (bleResult.success) {
          this.activeTransport = 'bluetooth';
          this.isBluetoothAvailable = true;
          console.log('[Transport] Bluetooth initialized as fallback');
          return { success: true, transport: 'bluetooth' };
        }
      }

      return {
        success: false,
        transport: 'none',
        error: 'All transport mechanisms failed',
      };

    } catch (error) {
      console.error('[Transport] Initialization error:', error);
      return {
        success: false,
        transport: 'none',
        error: error.message,
      };
    }
  }

  /**
   * Check if transport is ready
   * @returns {boolean}
   */
  isReady() {
    return this.activeTransport !== 'none';
  }

  /**
   * Get current transport type
   * @returns {TransportType}
   */
  getTransportType() {
    return this.activeTransport;
  }

  /**
   * Get list of connected peers
   * @returns {MeshPeer[]}
   */
  getConnectedPeers() {
    return Array.from(this.peers.values()).filter(p => p.isConnected);
  }

  /**
   * Get peer count
   * @returns {number}
   */
  getPeerCount() {
    return this.getConnectedPeers().length;
  }

  /**
   * Send message to a specific peer
   * @param {string} peerId - Target peer ID
   * @param {any} data - Message data (will be JSON serialized)
   * @returns {Promise<boolean>}
   */
  async sendToPeer(peerId, data) {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.isConnected) {
      console.warn(`[Transport] Peer ${peerId} not found or disconnected`);
      return false;
    }

    try {
      const payload = JSON.stringify(data);
      await peer.send(payload);
      peer.lastSeen = Date.now();
      return true;
    } catch (error) {
      console.error(`[Transport] Failed to send to ${peerId}:`, error);
      peer.isConnected = false;
      return false;
    }
  }

  /**
   * Broadcast message to all connected peers
   * @param {any} data - Message data
   * @returns {Promise<{sent: number, failed: number}>}
   */
  async broadcast(data) {
    const peers = this.getConnectedPeers();
    let sent = 0;
    let failed = 0;

    await Promise.all(
      peers.map(async (peer) => {
        const success = await this.sendToPeer(peer.id, data);
        if (success) sent++;
        else failed++;
      })
    );

    console.log(`[Transport] Broadcast: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  /**
   * Register message handler
   * @param {Function} handler - (peerId, message) => void
   */
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  /**
   * Register peer discovery handler
   * @param {Function} handler - (peerInfo) => void
   */
  onPeerDiscovered(handler) {
    this.discoveryHandlers.push(handler);
  }

  /**
   * Register connection/disconnection handler
   * @param {Function} handler - (peerId, connected) => void
   */
  onConnectionChange(handler) {
    this.connectionHandlers.push(handler);
  }

  /**
   * Remove all handlers (useful for cleanup)
   */
  removeAllHandlers() {
    this.messageHandlers = [];
    this.discoveryHandlers = [];
    this.connectionHandlers = [];
  }

  /**
   * Shutdown transport layer
   */
  async shutdown() {
    console.log('[Transport] Shutting down...');

    // Close all peer connections
    for (const [peerId, peer] of this.peers) {
      try {
        await peer.close();
      } catch (e) {
        console.warn(`[Transport] Error closing peer ${peerId}:`, e);
      }
    }
    this.peers.clear();

    // Shutdown LibP2P if active
    if (this.libp2pNode) {
      try {
        await this.libp2pNode.stop();
      } catch (e) {
        console.warn('[Transport] Error stopping LibP2P:', e);
      }
      this.libp2pNode = null;
    }

    // Disconnect Bluetooth if active
    if (this.activeTransport === 'bluetooth') {
      try {
        await BluetoothLE.disconnect({
          deviceId: this.deviceId,
        });
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    this.activeTransport = 'none';
    console.log('[Transport] Shutdown complete');
  }

  // Private methods

  /**
   * Initialize LibP2P node
   * @private
   */
  async _initLibP2P() {
    try {
      // Dynamic import to avoid issues if libp2p is not available
      const { createLibp2p } = await import('libp2p');
      const { webRTC } = await import('@libp2p/webrtc');
      const { webSockets } = await import('@libp2p/websockets');
      // const { mdns } = await import('@libp2p/mdns');
      const { bootstrap } = await import('@libp2p/bootstrap');

      const node = await createLibp2p({
        transports: [
          webRTC({
            // WebRTC config for browser environment
            rtcConfiguration: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
              ],
            },
          }),
          webSockets(),
        ],
        peerDiscovery: [
          /* mdns({
            interval: 1000,
          }), */
          bootstrap({
            list: [
              // Default bootstrap nodes (can be customized)
              '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
            ],
          }),
        ],
        connectionManager: {
          maxConnections: 50,
          minConnections: 5,
        },
      });

      await node.start();

      // Set up event handlers
      node.addEventListener('peer:discovery', (evt) => {
        const peerId = evt.detail.id.toString();
        console.log(`[Transport:LibP2P] Peer discovered: ${peerId}`);

        // Notify discovery handlers
        this.discoveryHandlers.forEach(h => {
          try {
            h({ id: peerId, transport: 'libp2p', multiaddrs: evt.detail.multiaddrs });
          } catch (e) {
            console.error('[Transport] Discovery handler error:', e);
          }
        });
      });

      node.addEventListener('peer:connect', async (evt) => {
        const peerId = evt.detail.toString();
        console.log(`[Transport:LibP2P] Peer connected: ${peerId}`);

        // Create peer wrapper
        const peer = this._createLibP2PPeer(peerId, node);
        this.peers.set(peerId, peer);

        // Notify connection handlers
        this.connectionHandlers.forEach(h => {
          try {
            h(peerId, true);
          } catch (e) {
            console.error('[Transport] Connection handler error:', e);
          }
        });

        // Set up message handler for this peer
        this._setupLibP2PMessageHandler(node, peerId);
      });

      node.addEventListener('peer:disconnect', (evt) => {
        const peerId = evt.detail.toString();
        console.log(`[Transport:LibP2P] Peer disconnected: ${peerId}`);

        const peer = this.peers.get(peerId);
        if (peer) {
          peer.isConnected = false;
        }

        this.connectionHandlers.forEach(h => {
          try {
            h(peerId, false);
          } catch (e) {
            console.error('[Transport] Disconnection handler error:', e);
          }
        });
      });

      return { success: true, node };

    } catch (error) {
      console.error('[Transport:LibP2P] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create LibP2P peer wrapper
   * @private
   */
  _createLibP2PPeer(peerId, node) {
    return {
      id: peerId,
      transport: 'libp2p',
      rawConnection: node,
      lastSeen: Date.now(),
      isConnected: true,

      send: async (data) => {
        // LibP2P send implementation using pubsub or direct protocol
        // This is a simplified version - actual implementation would use libp2p protocols
        const peer = await node.peerStore.get(peerId);
        if (!peer) throw new Error('Peer not found in peer store');

        // For now, use broadcast as a fallback
        // In production, use node.dialProtocol() for direct messaging
        console.log(`[Transport:LibP2P] Sending to ${peerId}: ${data.slice(0, 100)}...`);
      },

      close: async () => {
        try {
          await node.hangUp(peerId);
        } catch (e) {
          // Ignore hangup errors
        }
      },
    };
  }

  /**
   * Set up LibP2P message handler
   * @private
   */
  _setupLibP2PMessageHandler(node, peerId) {
    // In production, use libp2p protocol handlers
    // For now, handle via connection events
    // node.handle('/found404/1.0.0', ({ connection, stream }) => { ... });
  }

  /**
   * Initialize Bluetooth transport
   * @private
   */
  async _initBluetooth() {
    try {
      // Check if Bluetooth is available
      const isAvailable = await BluetoothLE.isEnabled();
      if (!isAvailable) {
        await BluetoothLE.enable();
      }

      // Start scanning for peers
      await BluetoothLE.startScan({
        services: ['found404-service'], // Custom service UUID
        allowDuplicates: false,
      });

      console.log('[Transport:Bluetooth] Scanning started');

      // Set up scan result handler
      BluetoothLE.addListener('onScanResult', (result) => {
        const deviceId = result.device.deviceId;
        console.log(`[Transport:Bluetooth] Device discovered: ${deviceId}`);

        this.discoveryHandlers.forEach(h => {
          try {
            h({
              id: deviceId,
              transport: 'bluetooth',
              name: result.device.name,
              rssi: result.device.rssi,
            });
          } catch (e) {
            console.error('[Transport] BLE discovery handler error:', e);
          }
        });

        // Auto-connect if not already connected
        if (!this.peers.has(deviceId)) {
          this._connectBluetoothPeer(deviceId);
        }
      });

      return { success: true };

    } catch (error) {
      console.error('[Transport:Bluetooth] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Connect to a Bluetooth peer
   * @private
   */
  async _connectBluetoothPeer(deviceId) {
    try {
      // Connect to device
      await BluetoothLE.connect({
        deviceId,
        timeout: 10000,
      });

      console.log(`[Transport:Bluetooth] Connected to ${deviceId}`);

      // Create peer wrapper
      const peer = this._createBluetoothPeer(deviceId);
      this.peers.set(deviceId, peer);

      // Notify handlers
      this.connectionHandlers.forEach(h => {
        try {
          h(deviceId, true);
        } catch (e) {
          console.error('[Transport] BLE connection handler error:', e);
        }
      });

      // Set up data listener
      this._setupBluetoothDataHandler(deviceId);

    } catch (error) {
      console.error(`[Transport:Bluetooth] Failed to connect to ${deviceId}:`, error);
    }
  }

  /**
   * Create Bluetooth peer wrapper
   * @private
   */
  _createBluetoothPeer(deviceId) {
    return {
      id: deviceId,
      transport: 'bluetooth',
      rawConnection: { deviceId },
      lastSeen: Date.now(),
      isConnected: true,

      send: async (data) => {
        const encoded = new TextEncoder().encode(data);
        // Write to characteristic
        await BluetoothLE.write({
          deviceId,
          service: 'found404-service',
          characteristic: 'found404-rx',
          value: btoa(String.fromCharCode(...encoded)),
        });
      },

      close: async () => {
        try {
          await BluetoothLE.disconnect({ deviceId });
        } catch (e) {
          // Ignore disconnect errors
        }
      },
    };
  }

  /**
   * Set up Bluetooth data handler
   * @private
   */
  async _setupBluetoothDataHandler(deviceId) {
    try {
      // Start notifications on RX characteristic
      await BluetoothLE.startNotifications({
        deviceId,
        service: 'found404-service',
        characteristic: 'found404-tx',
      });

      // Listen for notifications
      BluetoothLE.addListener('onNotification', (event) => {
        if (event.deviceId === deviceId) {
          try {
            // Decode base64 data
            const decoded = atob(event.value);
            const data = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
            const message = JSON.parse(new TextDecoder().decode(data));

            // Update last seen
            const peer = this.peers.get(deviceId);
            if (peer) {
              peer.lastSeen = Date.now();
            }

            // Notify message handlers
            this.messageHandlers.forEach(h => {
              try {
                h(deviceId, message);
              } catch (e) {
                console.error('[Transport] BLE message handler error:', e);
              }
            });
          } catch (e) {
            console.error('[Transport:Bluetooth] Failed to parse message:', e);
          }
        }
      });

    } catch (error) {
      console.error(`[Transport:Bluetooth] Failed to setup handler for ${deviceId}:`, error);
    }
  }
}

// Export singleton
export const transport = new TransportAbstraction();
export default transport;
export { TransportAbstraction };
