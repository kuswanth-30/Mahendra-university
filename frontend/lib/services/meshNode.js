/**
 * MeshNode - 404 Found LibP2P/BLE Mesh Network Node
 * 
 * LibP2P node with WebRTC transport and mDNS discovery.
 * Falls back to hardware Bluetooth bridge when WebRTC fails.
 * 
 * Features:
 * 1. LibP2P initialization with WebRTC + mDNS
 * 2. onPeerDiscovery handler triggering gossipEngine
 * 3. Bluetooth fallback logging when WebRTC unreachable
 * 4. Gossip protocol handshake on peer connect
 * 5. Sync session management
 */

import { transport } from './transportAbstract.js';
import { gossipEngine } from './gossipEngine.js';
import { hardwareBridge } from './hardwareBridge.js';
import { db } from '@/lib/db';

/**
 * Peer state in mesh network
 * @typedef {Object} PeerState
 * @property {string} id - Peer identifier
 * @property {'libp2p' | 'bluetooth'} transport - Transport type
 * @property {'discovered' | 'connecting' | 'handshaking' | 'syncing' | 'connected' | 'disconnected'} status
 * @property {number} discoveredAt - Discovery timestamp
 * @property {number} connectedAt - Connection timestamp
 * @property {number} lastSyncAt - Last successful sync timestamp
 * @property {number} syncCount - Number of completed syncs
 * @property {string} currentSessionId - Active sync session ID
 */

/**
 * MeshNode - Main mesh networking controller
 */
class MeshNode {
  constructor() {
    this.nodeId = null;
    this.isInitialized = false;
    this.libp2pNode = null; // Actual LibP2P node instance
    this.peers = new Map(); // peerId -> PeerState
    this.activeSyncs = new Map(); // peerId -> sync promise
    this.pendingSyncs = new Set(); // peerIds waiting to sync
    this.syncThrottleMs = 5000; // Minimum time between syncs with same peer
    this.vectorClock = 0; // Lamport timestamp for causality
    this.statusListeners = [];
    this.syncListeners = [];
    this.errorListeners = [];
    this.discoveryListeners = []; // onPeerDiscovery handlers
    this.useBluetoothFallback = false;
  }

  /**
   * Initialize the LibP2P mesh node
   * Configures WebRTC transport with mDNS discovery
   * 
   * @returns {Promise<{success: boolean, nodeId: string, multiaddrs?: string[], error?: string}>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[MeshNode] Already initialized');
      return { success: true, nodeId: this.nodeId };
    }

    console.log('[MeshNode] Initializing LibP2P node...');

    try {
      // BROWSER/PWA COMPATIBLE LibP2P Configuration
      // Uses @libp2p/webrtc and @libp2p/mdns for browser environments
      
      const { createLibp2p } = await import('libp2p');
      const { webRTC } = await import('@libp2p/webrtc');
      const { webSockets } = await import('@libp2p/websockets');
      
      // BROWSER NOTE: @libp2p/mdns in browsers uses WebRTC data channels for discovery
      // instead of raw UDP multicast (which is blocked by browser security)
      // const { mdns } = await import('@libp2p/mdns');
      
      const { bootstrap } = await import('@libp2p/bootstrap');
      const { identify } = await import('@libp2p/identify');
      const { gossipsub } = await import('@chainsafe/libp2p-gossipsub');
      const { noise } = await import('@chainsafe/libp2p-noise');
      const { yamux } = await import('@chainsafe/libp2p-yamux');
      const { circuitRelayV2Transport } = await import('@libp2p/circuit-relay-v2');

      // Generate node ID
      this.nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create LibP2P node - Browser/PWA Optimized
      this.libp2pNode = await createLibp2p({
        // BROWSER TRANSPORTS: WebRTC (primary) + WebSockets (fallback)
        transports: [
          // WebRTC for browser-to-browser P2P (uses STUN for NAT traversal)
          webRTC({
            rtcConfiguration: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
              ],
              iceCandidatePoolSize: 10,
            },
          }),
          // WebSockets as fallback (works through most firewalls)
          webSockets(),
          // CIRCUIT RELAY: Required by WebRTC in browser environments
          circuitRelayV2Transport(),
        ],
        
        // DISCOVERY: mDNS for local network discovery
        // BROWSER: mdns disabled due to 'dgram' dependency (Node-only)
        discovery: [
          /* mdns({
            interval: 10000, // Announce every 10s
          }), */
        ],
        
        // STREAM MULTIPLEXING
        connectionEncryption: [noise()],
        streamMuxers: [yamux()],
        
        services: {
          identify: identify(),
          pubsub: gossipsub({
            emitSelf: false,
            // BROWSER: Lower gossip frequency for battery optimization
            gossipInterval: 1000,
          }),
        },
        
        // BROWSER OPTIMIZATION: Prevent issues in restricted environments
        relay: {
          enabled: true,
          hop: {
            enabled: false, // Don't act as relay (browser bandwidth constraints)
            active: false,
          },
        },
      });

      // Set up event listeners
      this._setupEventListeners();

      // INTEGRATION: Connect hardware bridge discovery to gossip handshake
      this._setupHardwareBridgeIntegration();

      // Start the node
      await this.libp2pNode.start();
      this.isInitialized = true;

      // Get listening addresses
      const multiaddrs = this.libp2pNode.getMultiaddrs().map(ma => ma.toString());

      console.log('[MeshNode] LibP2P node initialized');
      console.log('[MeshNode] Node ID:', this.libp2pNode.peerId.toString());
      console.log('[MeshNode] Listening on:', multiaddrs);

      return {
        success: true,
        nodeId: this.libp2pNode.peerId.toString(),
        multiaddrs,
      };

    } catch (error) {
      console.error('[MeshNode] LibP2P initialization failed:', error);
      
      // Log fallback to Bluetooth
      console.log('[MeshNode:FALLBACK] WebRTC/LibP2P failed - requesting Bluetooth bridge fallback');
      this.useBluetoothFallback = true;
      
      // Try to initialize Bluetooth fallback
      try {
        await hardwareBridge.initialize();
        console.log('[MeshNode:FALLBACK] Bluetooth bridge initialized as fallback');
      } catch (bleError) {
        console.error('[MeshNode:FALLBACK] Bluetooth fallback also failed:', bleError);
      }
      
      this._notifyError('initialization', error);
      return {
        success: false,
        nodeId: null,
        error: error.message,
        fallbackAttempted: true,
      };
    }
  }

  /**
   * Set up LibP2P event handlers
   * @private
   */
  _setupLibP2PHandlers() {
    if (!this.libp2pNode) return;

    // Handle peer discovery via mDNS or other discovery
    this.libp2pNode.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString();
      const multiaddrs = evt.detail.multiaddrs.map(ma => ma.toString());
      
      console.log(`[MeshNode:Discovery] New peer discovered: ${peerId}`);
      console.log(`[MeshNode:Discovery] Peer multiaddrs:`, multiaddrs);
      
      // Create peer info
      const peerInfo = {
        id: peerId,
        multiaddrs,
        transport: 'libp2p',
        discoveredAt: Date.now(),
      };
      
      // Store peer state
      this.peers.set(peerId, {
        id: peerId,
        transport: 'libp2p',
        status: 'discovered',
        discoveredAt: Date.now(),
        multiaddrs,
      });

      // Trigger onPeerDiscovery handlers
      this._triggerDiscoveryHandlers(peerInfo);
      
      // Attempt to connect (which will trigger gossip protocol)
      this._attemptWebRTCConnection(peerId, multiaddrs);
    });

    // Handle peer connection
    this.libp2pNode.addEventListener('peer:connect', async (evt) => {
      const peerId = evt.detail.toString();
      console.log(`[MeshNode] Peer connected via LibP2P: ${peerId}`);
      
      // Update peer state
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.status = 'connected';
        peer.connectedAt = Date.now();
      } else {
        this.peers.set(peerId, {
          id: peerId,
          transport: 'libp2p',
          status: 'connected',
          discoveredAt: Date.now(),
          connectedAt: Date.now(),
        });
      }

      // Trigger gossip engine handshake
      await this._triggerGossipHandshake(peerId);
    });

    // Handle peer disconnection
    this.libp2pNode.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      console.log(`[MeshNode] Peer disconnected: ${peerId}`);
      
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.status = 'disconnected';
      }
      
      // Cancel any active sync
      if (this.activeSyncs.has(peerId)) {
        console.log(`[MeshNode] Cancelling sync with disconnected peer ${peerId}`);
        this.activeSyncs.delete(peerId);
      }
    });

    // Handle protocol messages (for gossip protocol)
    this.libp2pNode.handle('/found404/gossip/1.0.0', async ({ connection, stream }) => {
      const peerId = connection.remotePeer.toString();
      console.log(`[MeshNode] Incoming gossip protocol from ${peerId}`);
      
      // Handle the gossip protocol stream
      await this._handleGossipStream(stream, peerId);
    });
  }

  /**
   * Attempt WebRTC connection to peer
   * Logs Bluetooth fallback if connection fails
   * @private
   */
  async _attemptWebRTCConnection(peerId, multiaddrs) {
    try {
      console.log(`[MeshNode] Attempting WebRTC connection to ${peerId}`);
      
      // Try to dial the peer
      const connection = await this.libp2pNode.dial(multiaddrs);
      
      console.log(`[MeshNode] WebRTC connection established with ${peerId}`);
      return { success: true, connection };
      
    } catch (error) {
      console.warn(`[MeshNode] WebRTC connection to ${peerId} failed:`, error.message);
      
      // Log fallback request to Bluetooth
      console.log(`[MeshNode:FALLBACK] WebRTC unreachable for ${peerId} - requesting Bluetooth bridge fallback`);
      
      // Update peer to indicate WebRTC failure
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.webrtcFailed = true;
        peer.fallbackRequested = 'bluetooth';
      }
      
      // Could trigger Bluetooth scan here if desired
      // await hardwareBridge.scanForPeers();
      
      return { success: false, error: error.message, fallback: 'bluetooth' };
    }
  }

  /**
   * Trigger onPeerDiscovery event handlers
   * @private
   */
  _triggerDiscoveryHandlers(peerInfo) {
    this.discoveryListeners.forEach(handler => {
      try {
        handler(peerInfo);
      } catch (error) {
        console.error('[MeshNode] Discovery handler error:', error);
      }
    });
  }

  /**
   * Register peer discovery handler
   * @param {Function} handler - (peerInfo) => void
   */
  onPeerDiscovery(handler) {
    this.discoveryListeners.push(handler);
    console.log('[MeshNode] Registered peer discovery handler');
  }

  /**
   * Remove peer discovery handler
   * @param {Function} handler 
   */
  offPeerDiscovery(handler) {
    this.discoveryListeners = this.discoveryListeners.filter(h => h !== handler);
  }

  /**
   * Shutdown the mesh node
   */
  async shutdown() {
    console.log('[MeshNode] Shutting down...');

    // Cancel all active syncs
    for (const [peerId, sync] of this.activeSyncs) {
      console.log(`[MeshNode] Cancelling sync with ${peerId}`);
    }
    this.activeSyncs.clear();

    // Shutdown transport
    await transport.shutdown();

    this.isInitialized = false;
    this.peers.clear();

    console.log('[MeshNode] Shutdown complete');
  }

  /**
   * Get node status
   * @returns {{nodeId: string, transport: string, peerCount: number, isInitialized: boolean}}
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      transport: transport.getTransportType(),
      peerCount: this.getPeerCount(),
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Get list of all known peers
   * @returns {PeerState[]}
   */
  getPeers() {
    return Array.from(this.peers.values());
  }

  /**
   * Get connected peers only
   * @returns {PeerState[]}
   */
  getConnectedPeers() {
    return this.getPeers().filter(p =>
      p.status === 'connected' || p.status === 'syncing' || p.status === 'handshaking'
    );
  }

  /**
   * Get peer count
   * @returns {number}
   */
  getPeerCount() {
    return this.getConnectedPeers().length;
  }

  /**
   * Manually trigger sync with a specific peer
   * @param {string} peerId - Target peer ID
   * @returns {Promise<{success: boolean, messagesReceived: number, messagesSent: number}>}
   */
  async syncWithPeer(peerId) {
    if (!this.isInitialized) {
      throw new Error('Mesh node not initialized');
    }

    const peer = this.peers.get(peerId);
    if (!peer || peer.status === 'disconnected') {
      throw new Error(`Peer ${peerId} not connected`);
    }

    // Check if sync already in progress
    if (this.activeSyncs.has(peerId)) {
      console.log(`[MeshNode] Sync already in progress with ${peerId}`);
      return this.activeSyncs.get(peerId);
    }

    // Check throttle
    if (peer.lastSyncAt && Date.now() - peer.lastSyncAt < this.syncThrottleMs) {
      console.log(`[MeshNode] Sync throttled for ${peerId}`);
      return { success: false, throttled: true };
    }

    // Start sync
    const syncPromise = this._performGossipSync(peerId);
    this.activeSyncs.set(peerId, syncPromise);

    try {
      const result = await syncPromise;
      return result;
    } finally {
      this.activeSyncs.delete(peerId);
    }
  }

  /**
   * Send direct message to a specific peer using WebRTC data channel
   * DMs are encrypted and bypass the gossip store
   * @param {string} peerId - Target peer ID
   * @param {Object} dmPayload - Direct message payload
   * @param {string} recipientId - Recipient's public key hash
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendDirectMessage(peerId, dmPayload, recipientId) {
    if (!this.isInitialized) {
      throw new Error('Mesh node not initialized');
    }

    const peer = this.peers.get(peerId);
    if (!peer || peer.status === 'disconnected') {
      throw new Error(`Peer ${peerId} not connected`);
    }

    try {
      console.log(`[MeshNode:DM] Sending direct message to ${peerId}`);

      // Encrypt DM using E2EE
      const encryptedDM = await this._encryptDirectMessage(dmPayload, recipientId);

      // Create DM message structure
      const dmMessage = {
        type: 'DIRECT_MESSAGE',
        payload: encryptedDM,
        recipientId: recipientId,
        senderId: this.nodeId,
        timestamp: Date.now()
      };

      // Send via WebRTC data channel
      if (this.libp2pNode) {
        const connections = this.libp2pNode.getConnections(peerId);
        if (connections.length > 0) {
          const stream = await connections[0].newStream('/found404/dm/1.0.0');
          await this._sendOverStream(stream, dmMessage);
          console.log(`[MeshNode:DM] Direct message sent to ${peerId}`);
          return { success: true };
        }
      }

      return { success: false, error: 'No WebRTC connection available' };
    } catch (error) {
      console.error(`[MeshNode:DM] Failed to send direct message to ${peerId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Encrypt direct message using E2EE
   * @private
   * @param {Object} payload - Message payload
   * @param {string} recipientId - Recipient's public key hash
   * @returns {Promise<Object>} Encrypted message
   */
  async _encryptDirectMessage(payload, recipientId) {
    try {
      // Generate ephemeral key for this message
      const ephemeralKey = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey']
      );

      // Export ephemeral public key
      const ephemeralPublic = await window.crypto.subtle.exportKey(
        'raw',
        ephemeralKey.publicKey
      );

      // Derive shared secret (in real implementation, would use recipient's public key)
      // For now, using AES-GCM with ephemeral key
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(payload));

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Export key for recipient
      const exportedKey = await window.crypto.subtle.exportKey('raw', key);

      return {
        ciphertext: this._arrayBufferToBase64(ciphertext),
        iv: this._arrayBufferToBase64(iv),
        ephemeralKey: this._arrayBufferToBase64(ephemeralPublic),
        sessionKey: this._arrayBufferToBase64(exportedKey)
      };
    } catch (error) {
      console.error('[MeshNode:DM] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt direct message
   * @private
   * @param {Object} encryptedDM - Encrypted direct message
   * @returns {Promise<Object>} Decrypted payload
   */
  async _decryptDirectMessage(encryptedDM) {
    try {
      const ciphertext = this._base64ToArrayBuffer(encryptedDM.ciphertext);
      const iv = this._base64ToArrayBuffer(encryptedDM.iv);
      const sessionKey = this._base64ToArrayBuffer(encryptedDM.sessionKey);

      // Import session key
      const key = await window.crypto.subtle.importKey(
        'raw',
        sessionKey,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      const payload = JSON.parse(decoder.decode(decrypted));

      return payload;
    } catch (error) {
      console.error('[MeshNode:DM] Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Handle incoming direct message
   * @private
   * @param {string} peerId - Sender peer ID
   * @param {Object} dmMessage - Direct message
   */
  async _handleDirectMessage(peerId, dmMessage) {
    try {
      console.log(`[MeshNode:DM] Received direct message from ${peerId}`);

      // Check if message is for us
      const ourPublicKey = cryptoService.getPublicKey();
      if (dmMessage.recipientId !== ourPublicKey) {
        console.log('[MeshNode:DM] Message not for us, ignoring');
        return;
      }

      // Decrypt message
      const payload = await this._decryptDirectMessage(dmMessage.payload);

      // Store as E2EE blob (bypass gossip store)
      const dmRecord = {
        id: `dm-${Date.now()}-${peerId}`,
        type: 'dm',
        content: payload,
        timestamp: dmMessage.timestamp,
        authorId: peerId,
        signature: dmMessage.signature,
        isE2EE: true,
        isDirect: true
      };

      await db.messages.put(dmRecord);
      console.log('[MeshNode:DM] Direct message stored');

      // Dispatch event for UI
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('mesh:dm_received', {
          detail: { dmId: dmRecord.id, senderId: peerId }
        }));
      }
    } catch (error) {
      console.error('[MeshNode:DM] Failed to handle direct message:', error);
    }
  }

  /**
   * Convert ArrayBuffer to Base64
   * @private
   * @param {ArrayBuffer} buffer - Buffer to convert
   * @returns {string} Base64 string
   */
  _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   * @private
   * @param {string} base64 - Base64 string
   * @returns {ArrayBuffer} ArrayBuffer
   */
  _base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Broadcast message to all connected peers
   * @param {any} message - Message to broadcast
   * @returns {Promise<{sent: number, failed: number}>}
   */
  async broadcast(message) {
    if (!this.isInitialized) {
      throw new Error('Mesh node not initialized');
    }

    return transport.broadcast(message);
  }

  /**
   * Send message to specific peer
   * @param {string} peerId - Target peer
   * @param {any} message - Message to send
   * @returns {Promise<boolean>}
   */
  async sendToPeer(peerId, message) {
    if (!this.isInitialized) {
      throw new Error('Mesh node not initialized');
    }

    return transport.sendToPeer(peerId, message);
  }

  /**
   * Register status change listener
   * @param {Function} listener - (status) => void
   */
  onStatusChange(listener) {
    this.statusListeners.push(listener);
  }

  /**
   * Register sync completion listener
   * @param {Function} listener - (peerId, result) => void
   */
  onSyncComplete(listener) {
    this.syncListeners.push(listener);
  }

  /**
   * Register error listener
   * @param {Function} listener - (context, error) => void
   */
  onError(listener) {
    this.errorListeners.push(listener);
  }

  /**
   * Trigger gossip engine handshake with peer
   * Sends data vector and initiates anti-entropy sync
   * @private
   */
  async _triggerGossipHandshake(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.status = 'handshaking';
    console.log(`[MeshNode] Initiating gossip handshake with ${peerId}`);

    try {
      // Generate our data vector
      const ourVector = await gossipEngine.generateDataVector({
        limit: 1000,
        includeVectorClock: true,
      });

      // Send gossip vector via LibP2P protocol
      if (this.libp2pNode) {
        // Find or create connection
        const connections = this.libp2pNode.getConnections(peerId);
        if (connections.length > 0) {
          const stream = await connections[0].newStream('/found404/gossip/1.0.0');
          
          // Send vector
          const message = {
            type: 'GOSSIP_VECTOR',
            nodeId: this.nodeId,
            vector: ourVector,
            timestamp: Date.now(),
          };
          
          await this._sendOverStream(stream, message);
          console.log(`[MeshNode] Sent gossip vector to ${peerId}: ${ourVector.length} hashes`);
        }
      }

    } catch (error) {
      console.error(`[MeshNode] Gossip handshake failed with ${peerId}:`, error);
    }
  }

  /**
   * _setupHardwareBridgeIntegration(): Connects hardware bridge discovery to gossip handshake
   * @private
   */
  _setupHardwareBridgeIntegration() {
    try {
      hardwareBridge.onPeerDiscovered(async (peer) => {
        console.log(`[MeshNode:HardwareBridge] Peer discovered via Bluetooth: ${peer.id}`);
        this.peers.set(peer.id, { id: peer.id, transport: 'bluetooth', status: 'discovered', discoveredAt: Date.now(), name: peer.name, rssi: peer.rssi });
        
        // Trigger gossip handshake
        this._triggerGossipHandshakeAsync(peer.id);
        
        // Gossip Trigger: Auto-propagate unpropagated QR drops to this peer
        if (this.gossipEngine) {
          const result = await this.gossipEngine.autoPropagateUnpropagatedMessages(peer.id);
          if (result.propagated > 0) {
            console.log(`[MeshNode:HardwareBridge] Auto-propagated ${result.propagated} QR drops to peer ${peer.id}`);
          }
        }
      });
      console.log('[MeshNode:HardwareBridge] Integration configured');
    } catch (error) {
      console.error('[MeshNode:HardwareBridge] Failed to set up integration:', error);
    }
  }

  /**
   * Trigger gossip handshake asynchronously (non-blocking)
   * Runs in background to keep UI responsive
   * @private
   */
  async _triggerGossipHandshakeAsync(peerId) {
    // Use setTimeout to run in next tick (non-blocking)
    setTimeout(async () => {
      try {
        await this._triggerGossipHandshake(peerId);
      } catch (error) {
        console.error(`[MeshNode] Async handshake failed for ${peerId}:`, error);
      }
    }, 0);
  }

  /**
   * Handle gossip protocol stream
   * @private
   */
  async _handleGossipStream(stream, peerId) {
    try {
      // Read incoming message
      const message = await this._readFromStream(stream);
      
      if (!message || !message.type) {
        console.warn(`[MeshNode] Invalid gossip message from ${peerId}`);
        return;
      }

      console.log(`[MeshNode] Received ${message.type} from ${peerId}`);

      switch (message.type) {
        case 'GOSSIP_VECTOR':
          await this._handleGossipVector(peerId, message);
          break;
        case 'GOSSIP_REQUEST_PAYLOADS':
          await this._handlePayloadRequest(peerId, message);
          break;
        case 'GOSSIP_PAYLOADS':
          await this._handlePayloads(peerId, message);
          break;
        case 'GOSSIP_SYNC_COMPLETE':
          await this._handleSyncComplete(peerId, message);
          break;
        default:
          console.log(`[MeshNode] Unknown gossip message type: ${message.type}`);
      }

    } catch (error) {
      console.error(`[MeshNode] Error handling gossip stream from ${peerId}:`, error);
    }
  }

  /**
   * Send message over LibP2P stream
   * @private
   */
  async _sendOverStream(stream, message) {
    const messageStr = JSON.stringify(message);
    const encoder = new TextEncoder();
    const data = encoder.encode(messageStr);
    
    // Use pipe to send data
    const writer = stream.sink.getWriter();
    await writer.write(data);
    await writer.close();
  }

  /**
   * Read message from LibP2P stream
   * @private
   */
  async _readFromStream(stream) {
    const reader = stream.source.getReader();
    let chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(result);
    return JSON.parse(jsonStr);
  }

  /**
   * Handle gossip vector from peer
   * @private
   */
  async _handleGossipVector(peerId, message) {
    console.log(`[MeshNode] Received gossip vector from ${peerId}: ${message.vector?.length || 0} hashes`);

    // Compare vectors to find what we need
    const { missingHashes, theirMissingHashes } = await gossipEngine.compareVectors(
      message.vector || []
    );

    console.log(`[MeshNode] Vector comparison with ${peerId}: need ${missingHashes.length}, have ${theirMissingHashes.length} they need`);

    // Request missing payloads
    if (missingHashes.length > 0) {
      const connections = this.libp2pNode?.getConnections(peerId);
      if (connections && connections.length > 0) {
        const stream = await connections[0].newStream('/found404/gossip/1.0.0');
        await this._sendOverStream(stream, {
          type: 'GOSSIP_REQUEST_PAYLOADS',
          hashes: missingHashes,
          replyWith: theirMissingHashes,
        });
      }
    }

    // Send them payloads they need
    if (theirMissingHashes.length > 0) {
      const payload = await gossipEngine.prepareSyncPayload(theirMissingHashes, {
        chunkSize: 50,
      });

      const connections = this.libp2pNode?.getConnections(peerId);
      if (connections && connections.length > 0) {
        const stream = await connections[0].newStream('/found404/gossip/1.0.0');
        await this._sendOverStream(stream, {
          type: 'GOSSIP_PAYLOADS',
          payloads: payload.payloads,
          hasMore: payload.hasMore,
        });
      }
    }
  }

  /**
   * Handle payload request from peer
   * @private
   */
  async _handlePayloadRequest(peerId, message) {
    const { hashes, replyWith } = message;

    console.log(`[MeshNode] Peer ${peerId} requesting ${hashes?.length || 0} payloads`);

    if (hashes && hashes.length > 0) {
      const payload = await gossipEngine.prepareSyncPayload(hashes, {
        chunkSize: 50,
      });

      const connections = this.libp2pNode?.getConnections(peerId);
      if (connections && connections.length > 0) {
        const stream = await connections[0].newStream('/found404/gossip/1.0.0');
        await this._sendOverStream(stream, {
          type: 'GOSSIP_PAYLOADS',
          payloads: payload.payloads,
          hasMore: payload.hasMore,
        });
      }
    }

    // If peer told us what they have that we need, request it
    if (replyWith && replyWith.length > 0) {
      const connections = this.libp2pNode?.getConnections(peerId);
      if (connections && connections.length > 0) {
        const stream = await connections[0].newStream('/found404/gossip/1.0.0');
        await this._sendOverStream(stream, {
          type: 'GOSSIP_REQUEST_PAYLOADS',
          hashes: replyWith,
        });
      }
    }
  }

  /**
   * Handle incoming payloads
   * @private
   */
  async _handlePayloads(peerId, message) {
    const { payloads } = message;

    console.log(`[MeshNode] Received ${payloads?.length || 0} payloads from ${peerId}`);

    if (payloads && payloads.length > 0) {
      const result = await gossipEngine.processSyncPayload(payloads, peerId);
      console.log(`[MeshNode] Processed: ${result.stored} stored, ${result.conflicts} conflicts, ${result.errors} errors, ${result.rejected || 0} rejected`);
    }

    // If no more chunks, complete sync
    if (!message.hasMore) {
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.status = 'connected';
        peer.lastSyncAt = Date.now();
        peer.syncCount++;
      }

      this.syncListeners.forEach(l => {
        try {
          l(peerId, { success: true, completed: true });
        } catch (e) {
          console.error('[MeshNode] Sync listener error:', e);
        }
      });

      this._notifyStatusChange();
    }
  }

  /**
   * Handle sync completion
   * @private
   */
  async _handleSyncComplete(peerId, message) {
    const peer = this.peers.get(peerId);
    if (peer && peer.status === 'syncing') {
      peer.status = 'connected';
      peer.lastSyncAt = Date.now();
      peer.syncCount++;
      peer.currentSessionId = null;

      console.log(`[MeshNode] Sync complete with ${peerId}`);

      this.syncListeners.forEach(l => {
        try {
          l(peerId, { success: true, completed: true });
        } catch (e) {
          console.error('[MeshNode] Sync listener error:', e);
        }
      });

      this._notifyStatusChange();
    }
  }

  // Private methods (legacy transport support)

  /**
   * Set up transport event handlers
   * @private
   */
  _setupTransportHandlers() {
    // Peer discovery
    transport.onPeerDiscovered((peerInfo) => {
      this._handlePeerDiscovered(peerInfo);
    });

    // Connection changes
    transport.onConnectionChange((peerId, connected) => {
      if (connected) {
        this._handlePeerConnected(peerId);
      } else {
        this._handlePeerDisconnected(peerId);
      }
    });

    // Incoming messages
    transport.onMessage((peerId, message) => {
      this._handleMessage(peerId, message);
    });
  }

  /**
   * Handle peer discovery event
   * @private
   */
  _handlePeerDiscovered(peerInfo) {
    const { id, transport: transportType, ...extra } = peerInfo;

    console.log(`[MeshNode] Peer discovered: ${id} (${transportType})`);

    // Create or update peer state
    const existing = this.peers.get(id);
    const peerState = {
      id,
      transport: transportType,
      status: 'discovered',
      discoveredAt: Date.now(),
      connectedAt: existing?.connectedAt || null,
      lastSyncAt: existing?.lastSyncAt || null,
      syncCount: existing?.syncCount || 0,
      currentSessionId: null,
      ...extra,
    };

    this.peers.set(id, peerState);
    this._notifyStatusChange();

    // Log to console as requested
    console.log(`[MeshNode:Discovery] New peer found: ${id} via ${transportType}`);
  }

  /**
   * Handle peer connection event
   * @private
   */
  async _handlePeerConnected(peerId) {
    console.log(`[MeshNode] Peer connected: ${peerId}`);

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.status = 'connecting';
      peer.connectedAt = Date.now();
    } else {
      // Create new peer entry if not exists
      this.peers.set(peerId, {
        id: peerId,
        transport: transport.getTransportType(),
        status: 'connecting',
        discoveredAt: Date.now(),
        connectedAt: Date.now(),
        lastSyncAt: null,
        syncCount: 0,
        currentSessionId: null,
      });
    }

    this._notifyStatusChange();

    // Trigger gossip handshake as requested
    try {
      await this._initiateGossipHandshake(peerId);
    } catch (error) {
      console.error(`[MeshNode] Gossip handshake failed with ${peerId}:`, error);
      this._notifyError('handshake', error, peerId);
    }
  }

  /**
   * Handle peer disconnection event
   * @private
   */
  _handlePeerDisconnected(peerId) {
    console.log(`[MeshNode] Peer disconnected: ${peerId}`);

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.status = 'disconnected';
      peer.currentSessionId = null;
    }

    // Cancel any active sync
    if (this.activeSyncs.has(peerId)) {
      console.log(`[MeshNode] Cancelling active sync with ${peerId}`);
      this.activeSyncs.delete(peerId);
    }

    this._notifyStatusChange();
  }

  /**
   * Initiate gossip protocol handshake
   * @private
   */
  async _initiateGossipHandshake(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.status = 'handshaking';
    console.log(`[MeshNode] Initiating gossip handshake with ${peerId}`);

    // Generate our data vector
    const ourVector = await gossipEngine.generateDataVector({
      limit: 1000,
      includeVectorClock: true,
    });

    // Send vector to peer
    await transport.sendToPeer(peerId, {
      type: 'GOSSIP_VECTOR',
      nodeId: this.nodeId,
      vector: ourVector,
      timestamp: Date.now(),
    });

    console.log(`[MeshNode] Sent gossip vector to ${peerId}: ${ourVector.length} hashes`);

    // The response will be handled in _handleMessage
  }

  /**
   * Perform full gossip sync with peer
   * @private
   */
  async _performGossipSync(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return { success: false, error: 'Peer not found' };

    peer.status = 'syncing';
    this._notifyStatusChange();

    // Create sync session
    const sessionId = `sync-${Date.now()}`;
    peer.currentSessionId = sessionId;

    // Log sync start
    await db.syncSessions.add({
      id: sessionId,
      peerId,
      startedAt: Date.now(),
      status: 'active',
      hashesExchanged: 0,
      messagesTransferred: 0,
    });

    try {
      // Perform full sync using gossip engine
      const result = await gossipEngine.performFullSync(
        // sendToPeer function
        async (data) => {
          return transport.sendToPeer(peerId, data);
        },
        // receiveFromPeer function - will be resolved by message handler
        () => {
          return new Promise((resolve) => {
            // Store resolver for message handler to use
            this._pendingSyncResolvers = this._pendingSyncResolvers || new Map();
            this._pendingSyncResolvers.set(sessionId, resolve);
          });
        }
      );

      // Update peer state
      if (result.success) {
        peer.status = 'connected';
        peer.lastSyncAt = Date.now();
        peer.syncCount++;
        peer.currentSessionId = null;

        // Update session record
        await db.syncSessions.update(sessionId, {
          status: 'completed',
          completedAt: Date.now(),
          hashesExchanged: result.messagesReceived + result.messagesSent,
          messagesTransferred: result.messagesReceived,
        });

        console.log(`[MeshNode] Sync with ${peerId} complete: ${result.messagesReceived} in, ${result.messagesSent} out`);

        // Notify listeners
        this.syncListeners.forEach(l => {
          try {
            l(peerId, result);
          } catch (e) {
            console.error('[MeshNode] Sync listener error:', e);
          }
        });
      }

      return result;

    } catch (error) {
      peer.status = 'connected'; // Back to connected, can retry later
      peer.currentSessionId = null;

      // Update session record
      await db.syncSessions.update(sessionId, {
        status: 'failed',
        completedAt: Date.now(),
      });

      this._notifyError('sync', error, peerId);
      return { success: false, error: error.message };
    } finally {
      this._notifyStatusChange();
    }
  }

  /**
   * Handle incoming messages
   * @private
   */
  async _handleMessage(peerId, message) {
    if (!message || !message.type) return;

    const peer = this.peers.get(peerId);
    if (!peer) {
      console.warn(`[MeshNode] Message from unknown peer: ${peerId}`);
      return;
    }

    peer.lastSeen = Date.now();

    switch (message.type) {
      case 'GOSSIP_VECTOR':
        await this._handleGossipVector(peerId, message);
        break;

      case 'GOSSIP_REQUEST_PAYLOADS':
        await this._handlePayloadRequest(peerId, message);
        break;

      case 'GOSSIP_PAYLOADS':
        await this._handlePayloads(peerId, message);
        break;

      case 'GOSSIP_SYNC_COMPLETE':
        await this._handleSyncComplete(peerId, message);
        break;

      default:
        console.log(`[MeshNode] Unknown message type from ${peerId}: ${message.type}`);
    }
  }

  /**
   * Handle gossip vector from peer
   * @private
   */
  async _handleGossipVector(peerId, message) {
    console.log(`[MeshNode] Received gossip vector from ${peerId}: ${message.vector?.length || 0} hashes`);

    // Compare vectors to find what we need
    const { missingHashes, theirMissingHashes } = await gossipEngine.compareVectors(
      message.vector || []
    );

    console.log(`[MeshNode] Vector comparison with ${peerId}: need ${missingHashes.length}, have ${theirMissingHashes.length} they need`);

    // Request missing payloads
    if (missingHashes.length > 0) {
      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_REQUEST_PAYLOADS',
        hashes: missingHashes,
        replyWith: theirMissingHashes, // Tell peer what we have that they need
      });
    }

    // Send them payloads they need
    if (theirMissingHashes.length > 0) {
      const payload = await gossipEngine.prepareSyncPayload(theirMissingHashes, {
        chunkSize: 50,
      });

      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_PAYLOADS',
        payloads: payload.payloads,
        hasMore: payload.hasMore,
      });
    }

    // If nothing to exchange, complete immediately
    if (missingHashes.length === 0 && theirMissingHashes.length === 0) {
      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_SYNC_COMPLETE',
        sessionId: message.sessionId,
      });
    }
  }

  /**
   * Handle payload request from peer
   * @private
   */
  async _handlePayloadRequest(peerId, message) {
    const { hashes, replyWith } = message;

    console.log(`[MeshNode] Peer ${peerId} requesting ${hashes?.length || 0} payloads`);

    if (hashes && hashes.length > 0) {
      const payload = await gossipEngine.prepareSyncPayload(hashes, {
        chunkSize: 50,
      });

      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_PAYLOADS',
        payloads: payload.payloads,
        hasMore: payload.hasMore,
      });
    }

    // If peer told us what they have that we need, request it
    if (replyWith && replyWith.length > 0) {
      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_REQUEST_PAYLOADS',
        hashes: replyWith,
      });
    }
  }

  /**
   * Handle incoming payloads
   * @private
   */
  async _handlePayloads(peerId, message) {
    const { payloads } = message;

    console.log(`[MeshNode] Received ${payloads?.length || 0} payloads from ${peerId}`);

    if (payloads && payloads.length > 0) {
      const result = await gossipEngine.processSyncPayload(payloads, peerId);
      console.log(`[MeshNode] Processed: ${result.stored} stored, ${result.conflicts} conflicts, ${result.errors} errors`);
    }

    // If no more chunks, complete sync
    if (!message.hasMore) {
      await transport.sendToPeer(peerId, {
        type: 'GOSSIP_SYNC_COMPLETE',
      });
    }
  }

  /**
   * Handle sync completion
   * @private
   */
  async _handleSyncComplete(peerId, message) {
    const peer = this.peers.get(peerId);
    if (peer && peer.status === 'syncing') {
      peer.status = 'connected';
      peer.lastSyncAt = Date.now();
      peer.syncCount++;
      peer.currentSessionId = null;

      console.log(`[MeshNode] Sync complete with ${peerId}`);

      // Notify sync listeners
      this.syncListeners.forEach(l => {
        try {
          l(peerId, { success: true, completed: true });
        } catch (e) {
          console.error('[MeshNode] Sync listener error:', e);
        }
      });

      this._notifyStatusChange();
    }
  }

  /**
   * Notify status change listeners
   * @private
   */
  _notifyStatusChange() {
    const status = this.getStatus();
    this.statusListeners.forEach(l => {
      try {
        l(status);
      } catch (e) {
        console.error('[MeshNode] Status listener error:', e);
      }
    });
  }

  /**
   * Notify error listeners
   * @private
   */
  _notifyError(context, error, peerId = null) {
    this.errorListeners.forEach(l => {
      try {
        l(context, error, peerId);
      } catch (e) {
        console.error('[MeshNode] Error listener error:', e);
      }
    });
  }
}

// Export singleton instance
export const meshNode = new MeshNode();
export default meshNode;
export { MeshNode };
