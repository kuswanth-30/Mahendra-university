/**
 * useSecuritySettings - React Hook for 404 Found Security Management
 * 
 * Provides interface for security settings page:
 * - Key export (backup)
 * - Key wipe (emergency destruction)
 * - Key import (restore)
 * - Security status display
 */

import { useState, useEffect, useCallback } from 'react';
import { cryptoService } from '@/lib/services/crypto.js';

/**
 * Security settings hook
 * @returns {{
 *   isInitialized: boolean,
 *   keyId: string | null,
 *   publicKey: string | null,
 *   exportKeys: (password?: string) => Promise<{success: boolean, exportData?: string, error?: string}>,
 *   importKeys: (exportData: string, password?: string) => Promise<{success: boolean, error?: string}>,
 *   wipeKeys: () => Promise<{success: boolean, error?: string}>,
 *   isLoading: boolean,
 *   lastAction: { type: string, success: boolean, message: string } | null,
 * }}
 */
export function useSecuritySettings() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [keyId, setKeyId] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const result = await cryptoService.initialize();
      if (result.success) {
        setIsInitialized(true);
        setKeyId(cryptoService.getKeyId());
        setPublicKey(cryptoService.getPublicKey());
      }
    };
    init();
  }, []);

  /**
   * Export keys for backup
   * @param {string} [password] - Optional password to encrypt export
   */
  const exportKeys = useCallback(async (password = null) => {
    setIsLoading(true);
    setLastAction(null);

    try {
      const result = await cryptoService.exportKeys(password);
      
      if (result.success) {
        setLastAction({
          type: 'export',
          success: true,
          message: password 
            ? 'Keys exported with encryption. Store this safely!'
            : 'Keys exported. WARNING: Unencrypted - store securely!',
        });
      } else {
        setLastAction({
          type: 'export',
          success: false,
          message: result.error || 'Export failed',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Import keys from backup
   * @param {string} exportData - Base64 encoded key data
   * @param {string} [password] - Password if encrypted
   */
  const importKeys = useCallback(async (exportData, password = null) => {
    setIsLoading(true);
    setLastAction(null);

    try {
      const result = await cryptoService.importKeys(exportData, password);
      
      if (result.success) {
        setKeyId(cryptoService.getKeyId());
        setPublicKey(cryptoService.getPublicKey());
        setIsInitialized(true);
        setLastAction({
          type: 'import',
          success: true,
          message: 'Keys imported successfully. Your identity is restored.',
        });
      } else {
        setLastAction({
          type: 'import',
          success: false,
          message: result.error || 'Import failed',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Wipe all keys (DESTRUCTIVE ACTION)
   */
  const wipeKeys = useCallback(async () => {
    setIsLoading(true);
    setLastAction(null);

    try {
      const result = await cryptoService.wipeKeys();
      
      if (result.success) {
        setKeyId(null);
        setPublicKey(null);
        setIsInitialized(false);
        setLastAction({
          type: 'wipe',
          success: true,
          message: 'ALL KEYS WIPED. You have been disconnected from the mesh network.',
        });
      } else {
        setLastAction({
          type: 'wipe',
          success: false,
          message: result.error || 'Wipe failed',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isInitialized,
    keyId,
    publicKey,
    exportKeys,
    importKeys,
    wipeKeys,
    isLoading,
    lastAction,
  };
}

export default useSecuritySettings;
