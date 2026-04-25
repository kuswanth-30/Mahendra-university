/**
 * useMeshWorker - React Hook for Web Worker Mesh Operations
 * Offloads mesh sync to background thread
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { gossipEngine } from '@/lib/services/gossipEngine';

interface WorkerMessage {
  type: string;
  payload?: any;
  peerId?: string;
  error?: string;
}

interface UseMeshWorkerReturn {
  isReady: boolean;
  activeSyncs: string[];
  startBackgroundSync: (peerId: string) => void;
  stopBackgroundSync: (peerId: string) => void;
  terminateWorker: () => void;
}

export function useMeshWorker(): UseMeshWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeSyncs, setActiveSyncs] = useState<string[]>([]);

  // Initialize worker on mount
  useEffect(() => {
    // Create worker
    // Note: In production, you'd use a proper path to the compiled worker
    // For now, we create an inline worker
    const workerCode = `
      let syncIntervals = new Map();
      
      self.onmessage = (e) => {
        const { type, peerId } = e.data;
        
        if (type === 'START_SYNC' && peerId) {
          // Start periodic sync
          const interval = setInterval(() => {
            self.postMessage({ type: 'REQUEST_SYNC', peerId, timestamp: Date.now() });
          }, 30000);
          syncIntervals.set(peerId, interval);
          self.postMessage({ type: 'SYNC_STARTED', peerId });
        }
        
        if (type === 'STOP_SYNC' && peerId) {
          const interval = syncIntervals.get(peerId);
          if (interval) {
            clearInterval(interval);
            syncIntervals.delete(peerId);
          }
          self.postMessage({ type: 'SYNC_STOPPED', peerId });
        }
        
        if (type === 'TERMINATE') {
          syncIntervals.forEach(interval => clearInterval(interval));
          syncIntervals.clear();
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    workerRef.current = new Worker(workerUrl);
    setIsReady(true);

    console.log('404 FOUND: [MESH_WORKER] Initialized');

    return () => {
      terminateWorker();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // Handle worker messages
  useEffect(() => {
    if (!workerRef.current) return;

    const handleMessage = async (event: MessageEvent<WorkerMessage>) => {
      const { type, peerId, payload } = event.data;

      switch (type) {
        case 'REQUEST_SYNC':
          if (peerId) {
            console.log(`404 FOUND: [MESH_WORKER] Performing background sync with ${peerId}`);
            
            // Perform sync in main thread (gossip engine)
            const summary = await gossipEngine.generateSummary();
            
            // Emit event for transport layer
            // This would send the summary to the peer
            console.log(`404 FOUND: [MESH_WORKER] Summary generated: ${summary.length} messages`);
          }
          break;

        case 'SYNC_STARTED':
          if (peerId) {
            setActiveSyncs(prev => [...prev.filter(id => id !== peerId), peerId]);
            console.log(`404 FOUND: [MESH_WORKER] Background sync started for ${peerId}`);
          }
          break;

        case 'SYNC_STOPPED':
          if (peerId) {
            setActiveSyncs(prev => prev.filter(id => id !== peerId));
            console.log(`404 FOUND: [MESH_WORKER] Background sync stopped for ${peerId}`);
          }
          break;

        case 'ERROR':
          console.error('404 FOUND: [MESH_WORKER] Error:', event.data.error);
          break;
      }
    };

    workerRef.current.addEventListener('message', handleMessage);

    return () => {
      workerRef.current?.removeEventListener('message', handleMessage);
    };
  }, []);

  // Start background sync for a peer
  const startBackgroundSync = useCallback((peerId: string) => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({
      type: 'START_SYNC',
      peerId,
    });
  }, []);

  // Stop background sync for a peer
  const stopBackgroundSync = useCallback((peerId: string) => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({
      type: 'STOP_SYNC',
      peerId,
    });
  }, []);

  // Terminate worker
  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'TERMINATE' });
      workerRef.current.terminate();
      workerRef.current = null;
      setIsReady(false);
      setActiveSyncs([]);
      console.log('404 FOUND: [MESH_WORKER] Terminated');
    }
  }, []);

  return {
    isReady,
    activeSyncs,
    startBackgroundSync,
    stopBackgroundSync,
    terminateWorker,
  };
}

export default useMeshWorker;
