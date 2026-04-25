/**
 * useLibp2p - React Hook for LibP2P Mesh Networking
 * Manages P2P node lifecycle and gossip protocol
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createMeshNode, MESH_TOPIC } from '@/lib/services/libp2pConfig';
import type { Libp2p } from 'libp2p';

interface UseLibp2pReturn {
  node: Libp2p | null;
  isReady: boolean;
  peerId: string;
  connectedPeers: number;
  messages: any[];
  publish: (data: any) => Promise<void>;
  connect: (multiaddr: string) => Promise<void>;
}

export function useLibp2p(): UseLibp2pReturn {
  const [node, setNode] = useState<Libp2p | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [messages, setMessages] = useState<any[]>([]);
  
  const nodeRef = useRef<Libp2p | null>(null);

  // Initialize LibP2P node
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        console.log('404 FOUND: [LIBP2P_HOOK] Initializing node...');
        
        const libp2pNode = await createMeshNode();
        
        if (!mounted) {
          await libp2pNode.stop();
          return;
        }

        nodeRef.current = libp2pNode;
        setNode(libp2pNode);
        setPeerId(libp2pNode.peerId.toString());
        setIsReady(true);

        // Subscribe to mesh topic
        libp2pNode.services.pubsub?.subscribe(MESH_TOPIC);

        // Listen for incoming messages
        libp2pNode.services.pubsub?.addEventListener('message', (event: any) => {
          if (event.detail.topic === MESH_TOPIC) {
            try {
              const data = JSON.parse(new TextDecoder().decode(event.detail.data));
              setMessages(prev => [...prev, data]);
            } catch (err) {
              console.warn('404 FOUND: [LIBP2P_HOOK] Failed to parse message:', err);
            }
          }
        });

        // Listen for peer connections
        libp2pNode.addEventListener('peer:connect', () => {
          setConnectedPeers(libp2pNode.getPeers().length);
        });

        libp2pNode.addEventListener('peer:disconnect', () => {
          setConnectedPeers(libp2pNode.getPeers().length);
        });

        console.log('404 FOUND: [LIBP2P_HOOK] Node ready:', libp2pNode.peerId.toString());

      } catch (error) {
        console.error('404 FOUND: [LIBP2P_HOOK] Initialization failed:', error);
      }
    }

    init();

    return () => {
      mounted = false;
      if (nodeRef.current) {
        nodeRef.current.stop();
        nodeRef.current = null;
      }
    };
  }, []);

  // Publish message to mesh
  const publish = useCallback(async (data: any) => {
    if (!node || !isReady) {
      console.warn('404 FOUND: [LIBP2P_HOOK] Node not ready');
      return;
    }

    try {
      const message = {
        ...data,
        _timestamp: Date.now(),
        _peerId: peerId,
      };

      const bytes = new TextEncoder().encode(JSON.stringify(message));
      await node.services.pubsub?.publish(MESH_TOPIC, bytes);
      
      console.log('404 FOUND: [LIBP2P_HOOK] Published message to mesh');
    } catch (error) {
      console.error('404 FOUND: [LIBP2P_HOOK] Publish failed:', error);
    }
  }, [node, isReady, peerId]);

  // Connect to peer via multiaddr
  const connect = useCallback(async (multiaddr: string) => {
    if (!node || !isReady) {
      console.warn('404 FOUND: [LIBP2P_HOOK] Node not ready');
      return;
    }

    try {
      // @ts-ignore - dial method exists but types may vary
      await node.dial(multiaddr);
      console.log('404 FOUND: [LIBP2P_HOOK] Connected to:', multiaddr);
    } catch (error) {
      console.error('404 FOUND: [LIBP2P_HOOK] Connection failed:', error);
    }
  }, [node, isReady]);

  return {
    node,
    isReady,
    peerId,
    connectedPeers,
    messages,
    publish,
    connect,
  };
}

// Hook for checking LibP2P status only
export function useLibp2pStatus(): { isReady: boolean; peerCount: number } {
  const [status, setStatus] = useState({ isReady: false, peerCount: 0 });

  useEffect(() => {
    // This is a lightweight hook that could be connected to a global state
    // For now, returns default values
    return;
  }, []);

  return status;
}

export default useLibp2p;
