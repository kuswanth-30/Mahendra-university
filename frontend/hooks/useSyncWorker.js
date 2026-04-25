/**
 * useSyncWorker - React Hook for Background Gossip Sync Operations
 * 
 * Offloads data vector generation, comparison, and payload processing to WebWorker
 * Keeps UI at 60fps during intensive sync operations
 */

import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Hook for background sync operations
 * @returns {{
 *   isReady: boolean,
 *   isProcessing: boolean,
 *   generateVector: (options?: any) => Promise<any>,
 *   compareVectors: (peerVector: any[]) => Promise<any>,
 *   preparePayloads: (hashes: string[], options?: any) => Promise<any>,
 *   processPayloads: (payloads: any[], peerId: string) => Promise<any>,
 *   cleanupExpired: () => Promise<any>,
 *   getStats: () => Promise<any>,
 * }}
 */
export function useSyncWorker() {
  const workerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pendingRef = useRef(new Map());
  const idCounterRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        if (typeof Worker !== 'undefined') {
          const worker = new Worker('/workers/sync.worker.bundle.js');
          workerRef.current = worker;

          worker.onmessage = (event) => {
            const { id, result, error, type } = event.data;

            // Handle READY
            if (type === 'READY') {
              setIsReady(true);
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
            console.error('[useSyncWorker] Worker error:', error);
            setIsReady(true); // Fall back to main thread
          };
        } else {
          setIsReady(true);
        }
      } catch (error) {
        console.error('[useSyncWorker] Failed to init worker:', error);
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
   * Generate data vector
   */
  const generateVector = useCallback(async (options = {}) => {
    setIsProcessing(true);
    try {
      return await sendToWorker('GENERATE_VECTOR', { options });
    } finally {
      setIsProcessing(false);
    }
  }, [sendToWorker]);

  /**
   * Compare vectors with peer
   */
  const compareVectors = useCallback(async (peerVector) => {
    setIsProcessing(true);
    try {
      return await sendToWorker('COMPARE_VECTORS', { peerVector });
    } finally {
      setIsProcessing(false);
    }
  }, [sendToWorker]);

  /**
   * Prepare payloads for requested hashes
   */
  const preparePayloads = useCallback(async (hashes, options = {}) => {
    setIsProcessing(true);
    try {
      return await sendToWorker('PREPARE_PAYLOADS', { hashes, options });
    } finally {
      setIsProcessing(false);
    }
  }, [sendToWorker]);

  /**
   * Process incoming payloads
   */
  const processPayloads = useCallback(async (payloads, peerId, options = {}) => {
    setIsProcessing(true);
    try {
      return await sendToWorker('PROCESS_PAYLOADS', { payloads, peerId, options });
    } finally {
      setIsProcessing(false);
    }
  }, [sendToWorker]);

  /**
   * Cleanup expired messages
   */
  const cleanupExpired = useCallback(async () => {
    setIsProcessing(true);
    try {
      return await sendToWorker('CLEANUP_EXPIRED', {});
    } finally {
      setIsProcessing(false);
    }
  }, [sendToWorker]);

  /**
   * Get sync stats
   */
  const getStats = useCallback(async () => {
    try {
      return await sendToWorker('GET_STATS', {});
    } catch (e) {
      return { hashCount: 0, blobCount: 0 };
    }
  }, [sendToWorker]);

  return {
    isReady,
    isProcessing,
    generateVector,
    compareVectors,
    preparePayloads,
    processPayloads,
    cleanupExpired,
    getStats,
  };
}

export default useSyncWorker;
