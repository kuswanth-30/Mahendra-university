/**
 * Mesh Worker - Background Network Operations for 404 Found
 * 
 * Runs in separate thread to keep UI at 60fps
 * Handles: LibP2P node management, peer discovery, connection handling
 * 
 * Note: LibP2P can't run in WebWorker due to WebRTC requirements,
 * so this worker handles coordination and data processing only.
 * 
 * Message Protocol:
 * - INIT_NODE: Initialize mesh node configuration
 * - PEER_DISCOVERED: Process new peer discovery
 * - PEER_CONNECTED: Handle peer connection
 * - PEER_DISCONNECTED: Handle peer disconnection
 * - SYNC_REQUEST: Request sync with peer
 * - BROADCAST: Broadcast message to all peers
 */

// Mesh state
const state = {
  nodeId: null,
  isInitialized: false,
  peers: new Map(), // peerId -> peer info
  syncQueue: [], // Pending syncs
  syncInProgress: new Set(), // Active syncs
  stats: {
    totalSyncs: 0,
    messagesReceived: 0,
    messagesSent: 0,
    peersDiscovered: 0,
    peersConnected: 0,
  },
};

/**
 * Initialize mesh node
 */
async function initNode(config) {
  state.nodeId = config.nodeId || `node-${Date.now()}`;
  state.isInitialized = true;
  
  return {
    nodeId: state.nodeId,
    initialized: true,
  };
}

/**
 * Process peer discovery
 */
async function peerDiscovered(peerInfo) {
  const { id, transport, ...extra } = peerInfo;
  
  if (state.peers.has(id)) {
    // Update existing
    const existing = state.peers.get(id);
    existing.lastSeen = Date.now();
    existing.discoveryCount++;
  } else {
    // New peer
    state.peers.set(id, {
      id,
      transport,
      discoveredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'discovered',
      discoveryCount: 1,
      syncCount: 0,
      ...extra,
    });
    state.stats.peersDiscovered++;
  }
  
  return { peerId: id, status: 'discovered' };
}

/**
 * Process peer connection
 */
async function peerConnected(peerId) {
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.status = 'connected';
    peer.connectedAt = Date.now();
    state.stats.peersConnected++;
    
    // Queue for auto-sync
    state.syncQueue.push(peerId);
    
    return { peerId, status: 'connected', queuedForSync: true };
  }
  
  return { peerId, status: 'unknown' };
}

/**
 * Process peer disconnection
 */
async function peerDisconnected(peerId) {
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.status = 'disconnected';
    peer.disconnectedAt = Date.now();
    state.stats.peersConnected--;
  }
  
  // Remove from sync queue if present
  state.syncQueue = state.syncQueue.filter(id => id !== peerId);
  state.syncInProgress.delete(peerId);
  
  return { peerId, status: 'disconnected' };
}

/**
 * Request sync with specific peer
 */
async function syncRequest(peerId) {
  if (state.syncInProgress.has(peerId)) {
    return { peerId, status: 'already_syncing' };
  }
  
  state.syncInProgress.add(peerId);
  
  // Notify main thread to initiate sync
  self.postMessage({
    type: 'SYNC_START',
    payload: { peerId },
  });
  
  return { peerId, status: 'sync_initiated' };
}

/**
 * Complete sync with peer
 */
async function syncComplete(peerId, result) {
  state.syncInProgress.delete(peerId);
  
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.syncCount++;
    peer.lastSyncAt = Date.now();
  }
  
  state.stats.totalSyncs++;
  state.stats.messagesReceived += result.messagesReceived || 0;
  state.stats.messagesSent += result.messagesSent || 0;
  
  return { peerId, completed: true, stats: state.stats };
}

/**
 * Broadcast message coordination
 */
async function broadcast(message, excludePeerId = null) {
  const connectedPeers = Array.from(state.peers.values())
    .filter(p => p.status === 'connected' && p.id !== excludePeerId)
    .map(p => p.id);
  
  // Notify main thread to send to each peer
  for (const peerId of connectedPeers) {
    self.postMessage({
      type: 'SEND_TO_PEER',
      payload: { peerId, message },
    });
  }
  
  state.stats.messagesSent += connectedPeers.length;
  
  return { sent: connectedPeers.length, targets: connectedPeers };
}

/**
 * Process incoming message
 */
async function processIncomingMessage(peerId, message) {
  state.stats.messagesReceived++;
  
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.lastSeen = Date.now();
  }
  
  // Forward to main thread for handling
  self.postMessage({
    type: 'INCOMING_MESSAGE',
    payload: { peerId, message },
  });
  
  return { peerId, processed: true };
}

/**
 * Get mesh statistics
 */
async function getStats() {
  return {
    ...state.stats,
    peerCount: state.peers.size,
    connectedCount: Array.from(state.peers.values()).filter(p => p.status === 'connected').length,
    syncQueueLength: state.syncQueue.length,
    activeSyncs: state.syncInProgress.size,
  };
}

/**
 * Get peer list
 */
async function getPeers(filter = 'all') {
  let peers = Array.from(state.peers.values());
  
  if (filter === 'connected') {
    peers = peers.filter(p => p.status === 'connected');
  } else if (filter === 'discovered') {
    peers = peers.filter(p => p.status === 'discovered');
  }
  
  return peers;
}

/**
 * Get next peer for auto-sync
 */
async function getNextSyncTarget() {
  // Remove disconnected peers from queue
  state.syncQueue = state.syncQueue.filter(id => {
    const peer = state.peers.get(id);
    return peer && peer.status === 'connected';
  });
  
  // Find first peer not currently syncing
  for (const peerId of state.syncQueue) {
    if (!state.syncInProgress.has(peerId)) {
      return peerId;
    }
  }
  
  return null;
}

// Message handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  
  try {
    let result;
    
    switch (type) {
      case 'INIT_NODE':
        result = await initNode(payload.config);
        break;
        
      case 'PEER_DISCOVERED':
        result = await peerDiscovered(payload.peerInfo);
        break;
        
      case 'PEER_CONNECTED':
        result = await peerConnected(payload.peerId);
        break;
        
      case 'PEER_DISCONNECTED':
        result = await peerDisconnected(payload.peerId);
        break;
        
      case 'SYNC_REQUEST':
        result = await syncRequest(payload.peerId);
        break;
        
      case 'SYNC_COMPLETE':
        result = await syncComplete(payload.peerId, payload.result);
        break;
        
      case 'BROADCAST':
        result = await broadcast(payload.message, payload.excludePeerId);
        break;
        
      case 'INCOMING_MESSAGE':
        result = await processIncomingMessage(payload.peerId, payload.message);
        break;
        
      case 'GET_STATS':
        result = await getStats();
        break;
        
      case 'GET_PEERS':
        result = await getPeers(payload.filter);
        break;
        
      case 'GET_NEXT_SYNC_TARGET':
        result = await getNextSyncTarget();
        break;
        
      case 'RESET_STATS':
        state.stats = {
          totalSyncs: 0,
          messagesReceived: 0,
          messagesSent: 0,
          peersDiscovered: 0,
          peersConnected: 0,
        };
        result = { reset: true };
        break;
        
      default:
        result = { error: `Unknown command: ${type}` };
    }
    
    self.postMessage({ id, type, result, error: null });
  } catch (error) {
    self.postMessage({ id, type, result: null, error: error.message });
  }
};

// Signal ready
self.postMessage({ type: 'READY', result: { ready: true } });
