/**
 * useGossip - React Hook for P2P Gossip Protocol
 * Provides reactive interface to the GossipEngine
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { gossipEngine, PeerEvent, PeerSummary, SyncDelta } from '@/lib/services/gossipEngine';

interface UseGossipReturn {
  // State
  nodeId: string;
  activePeers: number;
  lastSyncResult: SyncDelta | null;
  isSyncing: boolean;
  
  // Stats
  messagesSent: number;
  messagesReceived: number;
  
  // Actions
  initiateManualSync: (peerId: string, peerSummary: PeerSummary) => Promise<SyncDelta>;
  generateSummary: () => Promise<any[]>;
  
  // Peer management (for testing/demo)
  simulatePeerConnect: (peerId: string) => void;
  simulatePeerDisconnect: (peerId: string) => void;
  simulateIncomingData: (peerId: string, data: any) => Promise<void>;
}

export function useGossip(): UseGossipReturn {
  const [nodeId] = useState(() => gossipEngine.getNodeId());
  const [activePeers, setActivePeers] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncDelta | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [messagesSent, setMessagesSent] = useState(0);
  const [messagesReceived, setMessagesReceived] = useState(0);

  // Subscribe to gossip events
  useEffect(() => {
    const unsubscribe = gossipEngine.subscribe((event: PeerEvent) => {
      console.log('404 FOUND: [GOSSIP_HOOK] Event received:', event.type, event.peerId);
      
      switch (event.type) {
        case 'peer_connected':
          setActivePeers(prev => prev + 1);
          break;
        case 'peer_disconnected':
          setActivePeers(prev => Math.max(0, prev - 1));
          break;
        case 'data_received':
          if (event.data?.type === 'DELTA_PUSH') {
            setMessagesReceived(prev => prev + (event.data?.payload?.length || 0));
          } else if (event.data?.type === 'SYNC_REQUEST') {
            setMessagesSent(prev => prev + (event.data?.payload?.requestedIds?.length || 0));
          }
          break;
      }
    });

    return unsubscribe;
  }, []);

  // Update active peer count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePeers(gossipEngine.getActivePeerCount());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Manual sync action
  const initiateManualSync = useCallback(async (peerId: string, peerSummary: PeerSummary): Promise<SyncDelta> => {
    setIsSyncing(true);
    try {
      const delta = await gossipEngine.initiateSync(peerSummary);
      setLastSyncResult(delta);
      return delta;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Generate summary
  const generateSummary = useCallback(async () => {
    return gossipEngine.generateSummary();
  }, []);

  // Simulation methods (for testing)
  const simulatePeerConnect = useCallback((peerId: string) => {
    gossipEngine.onPeerConnected(peerId);
  }, []);

  const simulatePeerDisconnect = useCallback((peerId: string) => {
    gossipEngine.onPeerDisconnected(peerId);
  }, []);

  const simulateIncomingData = useCallback(async (peerId: string, data: any) => {
    await gossipEngine.handleIncomingData(peerId, data);
  }, []);

  return {
    nodeId,
    activePeers,
    lastSyncResult,
    isSyncing,
    messagesSent,
    messagesReceived,
    initiateManualSync,
    generateSummary,
    simulatePeerConnect,
    simulatePeerDisconnect,
    simulateIncomingData,
  };
}

// Hook for just checking mesh connectivity
export function useMeshPeers(): { peerCount: number; nodeId: string } {
  const [peerCount, setPeerCount] = useState(0);
  const [nodeId] = useState(() => gossipEngine.getNodeId());

  useEffect(() => {
    const interval = setInterval(() => {
      setPeerCount(gossipEngine.getActivePeerCount());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return { peerCount, nodeId };
}

export default useGossip;
