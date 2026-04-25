/**
 * useNetworkStatus - Capacitor Network Hook for 404 Found
 * Distinguishes between 'no internet' and 'mesh available' states
 */

import { useState, useEffect, useCallback } from 'react';
import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';

/**
 * Network status types for DTN mesh environment
 * @typedef {'NO_INTERNET' | 'MESH_AVAILABLE' | 'ONLINE' | 'OFFLINE'} NetworkStatusType
 */

/**
 * Network status interface
 * @typedef {Object} NetworkStatus
 * @property {boolean} connected - Whether device has any connectivity
 * @property {string} connectionType - 'wifi', 'cellular', 'none', 'unknown', 'mesh'
 * @property {boolean} isOnline - Has internet access
 * @property {boolean} meshAvailable - Has local mesh connectivity
 * @property {NetworkStatusType} status - Current status type
 */

/**
 * Hook to monitor network status with DTN mesh awareness
 * @returns {{
 *   status: NetworkStatus,
 *   isOnline: boolean,
 *   meshAvailable: boolean,
 *   isOffline: boolean,
 *   connectionType: string,
 *   checkNetwork: () => Promise<NetworkStatus>
 * }}
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState({
    connected: false,
    connectionType: 'unknown',
    isOnline: false,
    meshAvailable: false,
    status: 'OFFLINE',
  });

  /**
   * Check current network state
   * @returns {Promise<NetworkStatus>}
   */
  const checkNetwork = useCallback(async () => {
    try {
      const networkStatus = await Network.getStatus();
      const deviceInfo = await Device.getInfo();

      // Determine connectivity state
      const connected = networkStatus.connected;
      const connectionType = networkStatus.connectionType;

      // Check for internet vs local mesh
      let isOnline = false;
      let meshAvailable = false;

      if (connected) {
        if (connectionType === 'wifi' || connectionType === 'cellular') {
          // Test actual internet connectivity
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('https://www.google.com/favicon.ico', {
              mode: 'no-cors',
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            isOnline = true;
          } catch (error) {
            // Connected but no internet - mesh may be available
            isOnline = false;
            meshAvailable = true;
          }
        } else {
          // Non-standard connection - assume mesh
          meshAvailable = true;
        }
      }

      // Determine status type
      let statusType = 'OFFLINE';
      if (isOnline) {
        statusType = 'ONLINE';
      } else if (meshAvailable) {
        statusType = 'MESH_AVAILABLE';
      } else if (connected) {
        statusType = 'NO_INTERNET';
      }

      const newStatus = {
        connected,
        connectionType,
        isOnline,
        meshAvailable,
        status: statusType,
        platform: deviceInfo.platform,
      };

      setStatus(newStatus);
      return newStatus;
    } catch (error) {
      console.error('[useNetworkStatus] Error checking network:', error);
      return {
        ...status,
        status: 'OFFLINE',
      };
    }
  }, [status]);

  useEffect(() => {
    // Initial check
    checkNetwork();

    // Subscribe to network changes
    let networkListener;
    const setupNetworkListener = async () => {
      networkListener = await Network.addListener('networkStatusChange', (networkStatus) => {
        console.log('[useNetworkStatus] Network changed:', networkStatus);
        checkNetwork();
      });
    };

    setupNetworkListener();

    // Periodic connectivity check (every 30 seconds)
    const interval = setInterval(checkNetwork, 30000);

    return () => {
      if (networkListener) {
        networkListener.remove();
      }
      clearInterval(interval);
    };
  }, [checkNetwork]);

  return {
    status,
    isOnline: status.isOnline,
    meshAvailable: status.meshAvailable,
    isOffline: !status.connected,
    connectionType: status.connectionType,
    checkNetwork,
  };
}

/**
 * Hook for simple online/offline check
 * @returns {boolean}
 */
export function useIsOnline() {
  const { isOnline } = useNetworkStatus();
  return isOnline;
}

/**
 * Hook for mesh availability check
 * @returns {boolean}
 */
export function useMeshAvailable() {
  const { meshAvailable } = useNetworkStatus();
  return meshAvailable;
}

/**
 * Hook to get detailed connection info
 * @returns {{
 *   connectionType: string,
 *   platform: string,
 *   isVirtual: boolean
 * }}
 */
export function useConnectionInfo() {
  const [info, setInfo] = useState({
    connectionType: 'unknown',
    platform: 'web',
    isVirtual: false,
  });

  useEffect(() => {
    const getInfo = async () => {
      try {
        const [networkStatus, deviceInfo] = await Promise.all([
          Network.getStatus(),
          Device.getInfo(),
        ]);

        setInfo({
          connectionType: networkStatus.connectionType,
          platform: deviceInfo.platform || 'web',
          isVirtual: deviceInfo.isVirtual || false,
        });
      } catch (error) {
        console.error('[useConnectionInfo] Error:', error);
      }
    };

    getInfo();
  }, []);

  return info;
}

export default useNetworkStatus;
