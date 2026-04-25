import Dexie from 'dexie';
import { identityService } from './identity.js';

/**
 * Security Service - Global Panic and Secure Wipe logic
 * Implements "Security-by-Design" principles for 404 Found.
 */
class SecurityService {
  /**
   * wipeAllData(): Irreversibly deletes all local application state.
   * - Deletes IndexedDB
   * - Clears localStorage
   * - Clears sessionStorage
   * - Wipes in-memory identity keys
   * - Performs hard reload to clear JavaScript memory context
   */
  async wipeAllData() {
    console.warn('[SECURITY] PANIC TRIGGERED: Initializing global data wipe...');
    
    try {
      // 1. Wipe in-memory identity keys
      identityService.wipeIdentity();

      // 2. Delete Dexie databases
      const databases = await Dexie.getDatabaseNames();
      for (const dbName of databases) {
        await Dexie.delete(dbName);
      }

      // 3. Clear Web Storage
      localStorage.clear();
      sessionStorage.clear();

      // 4. Clear Service Worker caches if possible
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }

      console.log('[SECURITY] Global wipe complete. Performing hard reload...');
      
      // 5. Force reload to clear in-memory state and reset app
      window.location.reload();
      return { success: true };
    } catch (error) {
      console.error('[SECURITY] Wipe failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * emergencyWipe(): Panic Protocol - Emergency Wipe for 404 Found
   * - Deletes IndexedDB database instance using Dexie.delete('FoundDatabase')
   * - Clears sessionStorage and localStorage
   * - Performs hard refresh with window.location.reload(true)
   * - Flushes JavaScript memory context where encryption keys reside
   */
  async emergencyWipe() {
    console.warn('[SECURITY] EMERGENCY WIPE TRIGGERED: Panic Protocol activated...');
    
    try {
      // Step 1: Delete IndexedDB database instance
      await Dexie.delete('FoundDatabase');
      console.log('[SECURITY] IndexedDB database deleted');

      // Step 2: Forcefully clear sessionStorage and localStorage
      sessionStorage.clear();
      localStorage.clear();
      console.log('[SECURITY] Web storage cleared');

      // Step 3: Wipe in-memory identity keys
      identityService.wipeIdentity();
      console.log('[SECURITY] In-memory identity keys wiped');

      // Step 4: Clear Service Worker caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
        console.log('[SECURITY] Service Worker caches cleared');
      }

      // Step 5: Set first launch flag for app state reset
      localStorage.setItem('404Found_firstLaunch', 'true');
      console.log('[SECURITY] First launch flag set');

      console.log('[SECURITY] Emergency wipe complete. Performing hard reload...');
      
      // Step 6: Perform hard refresh to flush JavaScript memory context
      window.location.reload(true);
      
      return { success: true };
    } catch (error) {
      console.error('[SECURITY] Emergency wipe failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * generatePseudonymousId(publicKey):
   * Generates a randomized hash of the public key for mesh routing.
   * Ensures no hardware IDs or usernames are leaked.
   */
  async generatePseudonymousId(publicKeyBase64) {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKeyBase64 + Math.random());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
}

export const securityService = new SecurityService();
export default securityService;
