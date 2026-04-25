/**
 * useCryptoWorker - React Hook for Background Crypto Operations
 * 
 * Offloads Ed25519 signing/verification to WebWorker to maintain 60fps UI
 * Falls back to main-thread crypto service if worker unavailable
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { cryptoService } from '@/lib/services/crypto.js';

/**
 * Hook for background crypto operations
 * @returns {{
 *   isReady: boolean,
 *   isLoading: boolean,
 *   useWorker: boolean,
 *   signMessage: (payload: any) => Promise<any>,
 *   verifyMessage: (signedMessage: any) => Promise<any>,
 *   exportKeys: (password?: string) => Promise<any>,
 *   importKeys: (exportData: string, password?: string) => Promise<any>,
 *   wipeKeys: () => Promise<any>,
 *   getPublicKey: () => Promise<string | null>,
 * }}
 */
export function useCryptoWorker() {
  const workerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [useWorker, setUseWorker] = useState(false);
  const pendingRef = useRef(new Map()); // messageId -> { resolve, reject }
  const idCounterRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        // Try to initialize worker
        if (typeof Worker !== 'undefined') {
          const worker = new Worker('/workers/crypto.worker.bundle.js');
          workerRef.current = worker;

          worker.onmessage = (event) => {
            const { id, result, error } = event.data;
            
            if (id && pendingRef.current.has(id)) {
              const { resolve, reject } = pendingRef.current.get(id);
              pendingRef.current.delete(id);
              
              if (error) {
                reject(new Error(error));
              } else {
                resolve(result);
              }
            }
            
            // Handle READY message
            if (event.data.type === 'READY') {
              setIsReady(true);
              setUseWorker(true);
              
              // Initialize with existing keys if any
              if (cryptoService.isReady()) {
                // We can't directly pass keys to worker, so let it generate
                // In production, would use structured clone to transfer keys
              }
            }
          };

          worker.onerror = (error) => {
            console.error('[useCryptoWorker] Worker error:', error);
            setUseWorker(false);
            setIsReady(true); // Fall back to main thread
          };
        } else {
          // Workers not supported, use main thread
          setUseWorker(false);
          setIsReady(true);
        }
      } catch (error) {
        console.error('[useCryptoWorker] Failed to init worker:', error);
        setUseWorker(false);
        setIsReady(true);
      }
    };

    initWorker();

    // Also initialize main thread crypto as fallback
    cryptoService.initialize().then(() => {
      if (!isReady) setIsReady(true);
    });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Send message to worker
  const sendToWorker = useCallback((type, payload) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !useWorker) {
        // Fall back to main thread
        reject(new Error('Worker not available'));
        return;
      }

      const id = ++idCounterRef.current;
      pendingRef.current.set(id, { resolve, reject });

      workerRef.current.postMessage({ id, type, payload });
    });
  }, [useWorker]);

  /**
   * Sign a message (uses worker or falls back to main thread)
   */
  const signMessage = useCallback(async (payload) => {
    setIsLoading(true);
    try {
      if (useWorker && workerRef.current) {
        return await sendToWorker('SIGN', { data: payload });
      } else {
        return await cryptoService.signMessage(payload);
      }
    } finally {
      setIsLoading(false);
    }
  }, [useWorker, sendToWorker]);

  /**
   * Verify a signed message
   */
  const verifyMessage = useCallback(async (signedMessage) => {
    setIsLoading(true);
    try {
      if (useWorker && workerRef.current) {
        return await sendToWorker('VERIFY', { signedMessage });
      } else {
        return await cryptoService.verifyMessage(signedMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [useWorker, sendToWorker]);

  /**
   * Export keys
   */
  const exportKeys = useCallback(async (password = null) => {
    setIsLoading(true);
    try {
      if (useWorker && workerRef.current) {
        return await sendToWorker('EXPORT', { password });
      } else {
        return await cryptoService.exportKeys(password);
      }
    } finally {
      setIsLoading(false);
    }
  }, [useWorker, sendToWorker]);

  /**
   * Import keys
   */
  const importKeys = useCallback(async (exportData, password = null) => {
    setIsLoading(true);
    try {
      if (useWorker && workerRef.current) {
        return await sendToWorker('IMPORT', { exportData, password });
      } else {
        return await cryptoService.importKeys(exportData, password);
      }
    } finally {
      setIsLoading(false);
    }
  }, [useWorker, sendToWorker]);

  /**
   * Wipe keys
   */
  const wipeKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      if (useWorker && workerRef.current) {
        await sendToWorker('WIPE', {});
      }
      return await cryptoService.wipeKeys();
    } finally {
      setIsLoading(false);
    }
  }, [useWorker, sendToWorker]);

  /**
   * Get public key
   */
  const getPublicKey = useCallback(async () => {
    if (useWorker && workerRef.current) {
      const result = await sendToWorker('GET_PUBLIC_KEY', {});
      return result?.publicKey || null;
    } else {
      return cryptoService.getPublicKey();
    }
  }, [useWorker, sendToWorker]);

  return {
    isReady,
    isLoading,
    useWorker,
    signMessage,
    verifyMessage,
    exportKeys,
    importKeys,
    wipeKeys,
    getPublicKey,
  };
}

export default useCryptoWorker;
