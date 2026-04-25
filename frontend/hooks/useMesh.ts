/**
 * useMesh - React Hook for LibP2P Mesh Network Status
 * 
 * Listens to meshNode.js events and provides reactive state:
 * - peerCount: Number of connected peers
 * - discoveredCount: Number of discovered peers
 * - peers: List of connected peer objects
 * - isConnected: Whether connected to any peer
 * - isInitialized: Whether mesh node is ready
 * - nodeId: Local node identifier
 * 
 * @example
 * const { peerCount, isConnected, nodeId } = useMesh();
 * // Header shows: peerCount === 0 ? '0 peers' : peerCount === 1 ? '1 peer' : `${peerCount}+ peers`
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { meshNode } from '@/lib/services/meshNode.js';

interface PeerInfo {
  id: string;
  transport: string;
  status: string;
  discoveredAt: number;
  connectedAt?: number;
}

interface UseMeshReturn {
  // Peer counts
  peerCount: number;
  discoveredCount: number;
  
  // Peer lists
  peers: PeerInfo[];
  discoveredPeers: PeerInfo[];
  
  // Status
  isConnected: boolean;
  isInitialized: boolean;
  nodeId: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  
  // Actions
  initialize: () => Promise<void>;
  refreshPeers: () => void;
}

export function useMesh(): UseMeshReturn {
  const [peerCount, setPeerCount] = useState(0);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [discoveredPeers, setDiscoveredPeers] = useState<PeerInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Initialize mesh on mount
  useEffect(() => {
    // Check if already initialized
    if (meshNode.isInitialized) {
      setIsInitialized(true);
      setNodeId(meshNode.nodeId);
      refreshPeerState();
      setupListeners();
      return;
    }

    // Auto-initialize
    initialize();
  }, []);

  // Set up meshNode event listeners
  const setupListeners = useCallback(() => {
    // Listen for peer discovery
    meshNode.onPeerDiscovery((peerInfo: any) => {
      console.log('[useMesh] Peer discovered:', peerInfo.id);
      refreshPeerState();
    });

    // Listen for status changes
    meshNode.onStatusChange((newStatus: any) => {
      console.log('[useMesh] Status changed:', newStatus);
      setIsConnected(newStatus.peerCount > 0);
      setPeerCount(newStatus.peerCount);
    });

    // Listen for sync events (indicates active peers)
    meshNode.onSyncComplete((peerId: string) => {
      console.log('[useMesh] Sync completed with:', peerId);
      refreshPeerState();
    });

    // Listen for errors
    meshNode.onError((context: string, err: Error) => {
      console.error('[useMesh] Mesh error:', context, err);
      setError(err.message);
      setStatus('error');
    });
  }, []);

  // Initialize mesh node
  const initialize = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    
    try {
      const result = await meshNode.initialize();
      
      if (result.success) {
        setIsInitialized(true);
        setIsConnected(meshNode.getPeerCount() > 0);
        setNodeId(result.nodeId);
        setStatus('connected');
        setPeerCount(meshNode.getPeerCount());
        
        // Set up event listeners
        setupListeners();
        refreshPeerState();
      } else {
        setStatus('error');
        setError(result.error || 'Failed to initialize mesh');
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message);
    }
  }, [setupListeners]);

  // Refresh peer state from meshNode
  const refreshPeerState = useCallback(() => {
    const connectedPeers = meshNode.getConnectedPeers();
    const allPeers = meshNode.getPeers();
    
    setPeers(connectedPeers);
    setDiscoveredPeers(allPeers);
    setPeerCount(connectedPeers.length);
    setDiscoveredCount(allPeers.length);
    setIsConnected(connectedPeers.length > 0);
  }, []);

  // Manual refresh
  const refreshPeers = useCallback(() => {
    refreshPeerState();
  }, [refreshPeerState]);

  return {
    peerCount,
    discoveredCount,
    peers,
    discoveredPeers,
    isConnected,
    isInitialized,
    nodeId,
    status,
    error,
    initialize,
    refreshPeers,
  };
}

// Hook for simplified peer count display (for header)
export function usePeerCount(): { 
  peerCount: number; 
  peerStatusText: string;
  isConnected: boolean;
} {
  const [peerCount, setPeerCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      const count = meshNode.getPeerCount();
      setPeerCount(count);
      setIsConnected(count > 0);
    };

    // Initial check
    updateCount();

    // Listen for changes
    const unsubscribeStatus = meshNode.onStatusChange?.((status: any) => {
      setPeerCount(status.peerCount || 0);
      setIsConnected(status.peerCount > 0);
    });

    // Periodic check
    const interval = setInterval(updateCount, 3000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Generate status text: "0 peers", "1 peer", "2+ peers"
  const peerStatusText = peerCount === 0 
    ? '0 peers' 
    : peerCount === 1 
      ? '1 peer' 
      : `${peerCount}+ peers`;

  return { peerCount, peerStatusText, isConnected };
}

export default useMesh;
