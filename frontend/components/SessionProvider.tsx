'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { securityService } from '@/lib/services/securityService';

const SessionContext = createContext(null);

/**
 * SessionProvider - Manages Ephemeral Ed25519 Session Keys
 * 
 * SECURITY CONSTRAINTS:
 * - Keys are strictly IN-MEMORY (never written to Disk/IndexedDB)
 * - Keys are wiped on visibilitychange (app to background)
 * - Keys are rotated on every app launch
 */
export function SessionProvider({ children }) {
  const [sessionKey, setSessionKey] = useState(null);
  const [isWiped, setIsWiped] = useState(false);
  const privateKeyRef = useRef(null); // Truly in-memory only

  const generateSessionKeys = async () => {
    try {
      console.log('[SESSION] Generating new ephemeral Ed25519 session keys...');
      
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true, // extractable
        ['sign', 'verify']
      ) as CryptoKeyPair;

      // Export public key for sharing/routing
      const exportedPublic = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublic)));
      
      // Store in memory
      privateKeyRef.current = keyPair.privateKey;
      setSessionKey({
        publicKey: publicKeyBase64,
        nodeId: await securityService.generatePseudonymousId(publicKeyBase64)
      });
      setIsWiped(false);
      
      console.log('[SESSION] Ephemeral keys active. Node ID:', sessionKey?.nodeId);
    } catch (error) {
      console.error('[SESSION] Key generation failed:', error);
    }
  };

  const wipeSession = () => {
    console.warn('[SESSION] SECURITY WIPE: Clearing ephemeral keys from memory.');
    privateKeyRef.current = null;
    setSessionKey(null);
    setIsWiped(true);
  };

  useEffect(() => {
    // 1. Initial Generation
    generateSessionKeys();

    // 2. background Wipe Listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wipeSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wipeSession();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ sessionKey, privateKeyRef, isWiped, generateSessionKeys, wipeSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
