/**
 * useMeshWorker - React Hook for Background Mesh Network Operations
 * 
 * Offloads peer management and coordination to WebWorker
 * Coordinates with main-thread LibP2P node
 */

import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Hook for background mesh operations
 * @returns {{
 *   isReady: boolean,
 *   initNode: (config: any) => Promise<any>,
 *   peerDiscovered: (peerInfo: any) => Promise<any>,
 *   peerConnected: (peerId: string) => Promise<any>,
 *   peerDisconnected: (peerId: string) => Promise<any>,
 *   requestSync: (peerId: string) => Promise<any>,
 *   syncComplete: (peerId: string, result: any) => Promise<any>,
 *   broadcast: (message: any, excludePeerId?: string) => Promise<any>,
 *   processIncoming: (peerId: string, message: any) => Promise<any>,
 *   getStats: () => Promise<any>,
 *   getPeers: (filter?: string) => Promise<any[]>,
 *   getNextSyncTarget: () => Promise<string | null>,
 *   onMeshEvent: (handler: (event: any) => void) => () => void,
 * }}
 */
export function useMeshWorker() {
  const workerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const pendingRef = useRef(new Map());
  const eventHandlersRef = useRef([]);
  const idCounterRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        if (typeof Worker !== 'undefined') {
          const worker = new Worker('/workers/mesh.worker.bundle.js');
          workerRef.current = worker;

          worker.onmessage = (event) => {
            const { id, result, error, type, payload } = event.data;

            // Handle READY
            if (type === 'READY') {
              setIsReady(true);
              return;
            }

            // Handle mesh events (SYNC_START, SEND_TO_PEER, INCOMING_MESSAGE)
            if (['SYNC_START', 'SEND_TO_PEER', 'INCOMING_MESSAGE'].includes(type)) {
              eventHandlersRef.current.forEach(handler => {
                try {
                  handler({ type, payload });
                } catch (e) {
                  console.error('[useMeshWorker] Event handler error:', e);
                }
              });
              return;
            }

            if (id && pendingRef.current.has(id)) {
              const { resolve, reject } = pendingRef.current.get(id);
              pendingRef.current.delete(id);

              if (error) {
                reject(new Error(error));
              } else {
                resolve(result);
              }
            }
          };

          worker.onerror = (error) => {
            console.error('[useMeshWorker] Worker error:', error);
            setIsReady(true);
          };
        } else {
          setIsReady(true);
        }
      } catch (error) {
        console.error('[useMeshWorker] Failed to init worker:', error);
        setIsReady(true);
      }
    };

    initWorker();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Send message to worker
  const sendToWorker = useCallback((type, payload) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not available'));
        return;
      }

      const id = ++idCounterRef.current;
      pendingRef.current.set(id, { resolve, reject });

      workerRef.current.postMessage({ id, type, payload });
    });
  }, []);

  /**
   * Register mesh event handler
   */
  const onMeshEvent = useCallback((handler) => {
    eventHandlersRef.current.push(handler);
    return () => {
      eventHandlersRef.current = eventHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  /**
   * Initialize mesh node
   */
  const initNode = useCallback(async (config) => {
    return await sendToWorker('INIT_NODE', { config });
  }, [sendToWorker]);

  /**
   * Report peer discovery
   */
  const peerDiscovered = useCallback(async (peerInfo) => {
    return await sendToWorker('PEER_DISCOVERED', { peerInfo });
  }, [sendToWorker]);

  /**
   * Report peer connection
   */
  const peerConnected = useCallback(async (peerId) => {
    return await sendToWorker('PEER_CONNECTED', { peerId });
  }, [sendToWorker]);

  /**
   * Report peer disconnection
   */
  const peerDisconnected = useCallback(async (peerId) => {
    return await sendToWorker('PEER_DISCONNECTED', { peerId });
  }, [sendToWorker]);

  /**
   * Request sync with peer
   */
  const requestSync = useCallback(async (peerId) => {
    return await sendToWorker('SYNC_REQUEST', { peerId });
  }, [sendToWorker]);

  /**
   * Report sync completion
   */
  const syncComplete = useCallback(async (peerId, result) => {
    return await sendToWorker('SYNC_COMPLETE', { peerId, result });
  }, [sendToWorker]);

  /**
   * Broadcast message
   */
  const broadcast = useCallback(async (message, excludePeerId = null) => {
    return await sendToWorker('BROADCAST', { message, excludePeerId });
  }, [sendToWorker]);

  /**
   * Process incoming message
   */
  const processIncoming = useCallback(async (peerId, message) => {
    return await sendToWorker('INCOMING_MESSAGE', { peerId, message });
  }, [sendToWorker]);

  /**
   * Get mesh stats
   */
  const getStats = useCallback(async () => {
    return await sendToWorker('GET_STATS', {});
  }, [sendToWorker]);

  /**
   * Get peer list
   */
  const getPeers = useCallback(async (filter = 'all') => {
    return await sendToWorker('GET_PEERS', { filter });
  }, [sendToWorker]);

  /**
   * Get next auto-sync target
   */
  const getNextSyncTarget = useCallback(async () => {
    return await sendToWorker('GET_NEXT_SYNC_TARGET', {});
  }, [sendToWorker]);

  return {
    isReady,
    initNode,
    peerDiscovered,
    peerConnected,
    peerDisconnected,
    requestSync,
    syncComplete,
    broadcast,
    processIncoming,
    getStats,
    getPeers,
    getNextSyncTarget,
    onMeshEvent,
  };
}

export default useMeshWorker;
