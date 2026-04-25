/**
 * useMesh - React Hook for LibP2P Mesh Network Status
 * 
 * Listens to meshNode.js events and provides reactive state:
 * - peerCount: Number of connected peers
 * - discoveredPeers: List of discovered peers
 * - isConnected: Whether connected to mesh
 * - isInitialized: Whether mesh node is ready
 * - status: 'idle' | 'connecting' | 'connected' | 'error'
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { meshNode } from '@/lib/services/meshNode.js';

/**
 * Hook for mesh network status and peer management
 * @returns {{
 *   peerCount: number,
 *   discoveredCount: number,
 *   peers: Array,
 *   isConnected: boolean,
 *   isInitialized: boolean,
 *   status: string,
 *   error: string | null,
 *   initialize: () => Promise<void>,
 *   refreshPeers: () => void,
 * }}
 */
export function useMesh() {
  const [peerCount, setPeerCount] = useState(0);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [peers, setPeers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  
  const unsubscribeRef = useRef(null);

  // Initialize mesh node
  const initialize = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    
    try {
      const result = await meshNode.initialize();
      
      if (result.success) {
        setIsInitialized(true);
        setIsConnected(true);
        setStatus('connected');
        
        // Set up event listeners
        setupListeners();
      } else {
        setStatus('error');
        setError(result.error || 'Failed to initialize mesh');
      }
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }, []);

  // Set up meshNode event listeners
  const setupListeners = useCallback(() => {
    // Listen for peer discovery
    meshNode.onPeerDiscovery((peerInfo) => {
      console.log('[useMesh] Peer discovered:', peerInfo.id);
      refreshPeerState();
    });

    // Listen for status changes
    meshNode.onStatusChange((newStatus) => {
      console.log('[useMesh] Status changed:', newStatus);
      setIsConnected(newStatus.peerCount > 0);
      setPeerCount(newStatus.peerCount);
    });

    // Listen for sync events (indicates active peers)
    meshNode.onSyncComplete((peerId, result) => {
      console.log('[useMesh] Sync completed with:', peerId);
      refreshPeerState();
    });

    // Listen for errors
    meshNode.onError((context, err) => {
      console.error('[useMesh] Mesh error:', context, err);
      setError(err.message);
    });
  }, []);

  // Refresh peer state from meshNode
  const refreshPeerState = useCallback(() => {
    const connectedPeers = meshNode.getConnectedPeers();
    const allPeers = meshNode.getPeers();
    
    setPeers(connectedPeers);
    setPeerCount(connectedPeers.length);
    setDiscoveredCount(allPeers.length);
    setIsConnected(connectedPeers.length > 0);
  }, []);

  // Manual refresh
  const refreshPeers = useCallback(() => {
    refreshPeerState();
  }, [refreshPeerState]);

  // Initialize on mount
  useEffect(() => {
    // Check if already initialized
    if (meshNode.isInitialized) {
      setIsInitialized(true);
      setIsConnected(meshNode.getPeerCount() > 0);
      refreshPeerState();
      setupListeners();
    } else {
      // Auto-initialize
      initialize();
    }

    // Periodic refresh (every 5 seconds)
    const interval = setInterval(refreshPeerState, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [initialize, refreshPeerState, setupListeners]);

  return {
    peerCount,
    discoveredCount,
    peers,
    isConnected,
    isInitialized,
    status,
    error,
    initialize,
    refreshPeers,
  };
}

/**
 * Simplified hook for just peer count (for header display)
 * @returns {{ peerCount: number, peerStatusText: string }}
 */
export function usePeerCount() {
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const count = meshNode.getPeerCount();
      setPeerCount(count);
    };

    // Initial check
    updateCount();

    // Listen for changes
    meshNode.onStatusChange(updateCount);
    meshNode.onSyncComplete(updateCount);

    // Periodic check
    const interval = setInterval(updateCount, 3000);

    return () => clearInterval(interval);
  }, []);

  // Generate status text
  const peerStatusText = peerCount === 0 
    ? '0 peers' 
    : peerCount === 1 
      ? '1 peer' 
      : `${peerCount}+ peers`;

  return { peerCount, peerStatusText };
}

export default useMesh;
