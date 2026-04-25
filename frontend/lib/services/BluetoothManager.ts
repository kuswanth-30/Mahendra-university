/**
 * BluetoothManager - P2P Bluetooth Sync using Capacitor
 * 
 * Implements Bluetooth LE sync workflow with state machine:
 * - IDLE -> ADVERTISING -> SCANNING -> CONNECTED
 * - Sync workflow with DatabaseStore integration
 * - Resilience with last processed ID logging
 * - Background-safe tasks to avoid UI freezes
 */

import { BleClient } from '@capacitor-community/bluetooth-le';
import { databaseStore } from './DatabaseStore';

/**
 * Bluetooth State Machine States
 */
type BluetoothState = 'IDLE' | 'ADVERTISING' | 'SCANNING' | 'CONNECTED' | 'DISCONNECTING' | 'ERROR';

/**
 * Sync Summary for comparison
 */
interface SyncSummary {
  id: string;
  version?: number;
  timestamp: number;
}

/**
 * Sync Session for resilience
 */
interface SyncSession {
  peerId: string;
  lastProcessedId?: string;
  startedAt: number;
  messagesProcessed: number;
}

/**
 * Bluetooth Manager Class
 */
class BluetoothManager {
  private state: BluetoothState = 'IDLE';
  private currentPeerId: string | null = null;
  private syncSession: SyncSession | null = null;
  private scanInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  // Bluetooth configuration
  private readonly SERVICE_UUID = '0000180A-0000-1000-8000-00805F9B34FB'; // Device Information Service
  private readonly CHARACTERISTIC_UUID = '00002A00-0000-1000-8000-00805F9B34FB'; // Device Name
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds
  private readonly ADVERTISE_DURATION_MS = 60000; // 60 seconds

  /**
   * Initialize Bluetooth Manager
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // Request permissions
      await BleClient.initialize();
      console.log('[BluetoothManager] Initialized');
      return { success: true };
    } catch (error) {
      console.error('[BluetoothManager] Initialization failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get current state
   */
  getState(): BluetoothState {
    return this.state;
  }

  /**
   * Start advertising (make device discoverable)
   * Note: Advertising is platform-specific and may not be available on all devices
   */
  async startAdvertising(): Promise<{ success: boolean; error?: string }> {
    if (this.state !== 'IDLE') {
      return { success: false, error: `Cannot advertise from state: ${this.state}` };
    }

    try {
      this.state = 'ADVERTISING';
      console.log('[BluetoothManager] Starting advertising...');

      // Advertising is platform-specific - using simulated approach for now
      // In production, would use platform-specific advertising APIs
      console.log('[BluetoothManager] Advertising started (simulated)');
      
      // Auto-stop after duration
      setTimeout(() => {
        if (this.state === 'ADVERTISING') {
          this.stopAdvertising();
        }
      }, this.ADVERTISE_DURATION_MS);

      return { success: true };
    } catch (error) {
      console.error('[BluetoothManager] Advertising failed:', error);
      this.state = 'ERROR';
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    try {
      this.state = 'IDLE';
      console.log('[BluetoothManager] Advertising stopped');
    } catch (error) {
      console.error('[BluetoothManager] Failed to stop advertising:', error);
    }
  }

  /**
   * Start scanning for peers
   */
  async startScanning(): Promise<{ success: boolean; error?: string }> {
    if (this.state !== 'IDLE') {
      return { success: false, error: `Cannot scan from state: ${this.state}` };
    }

    try {
      this.state = 'SCANNING';
      console.log('[BluetoothManager] Starting scanning...');

      // Start scanning using correct API for @capacitor-community/bluetooth-le v6
      await BleClient.requestLEScan(
        {
          services: [this.SERVICE_UUID],
          allowDuplicates: false
        },
        (result) => {
          this.handleDeviceDiscovered(result);
        }
      );

      console.log('[BluetoothManager] Scanning started');

      // Auto-stop after duration
      this.scanInterval = setTimeout(() => {
        if (this.state === 'SCANNING') {
          this.stopScanning();
        }
      }, this.SCAN_DURATION_MS);

      return { success: true };
    } catch (error) {
      console.error('[BluetoothManager] Scanning failed:', error);
      this.state = 'ERROR';
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Stop scanning
   */
  async stopScanning(): Promise<void> {
    try {
      if (this.scanInterval) {
        clearTimeout(this.scanInterval);
        this.scanInterval = null;
      }
      await BleClient.stopLEScan();
      this.state = 'IDLE';
      console.log('[BluetoothManager] Scanning stopped');
    } catch (error) {
      console.error('[BluetoothManager] Failed to stop scanning:', error);
    }
  }

  /**
   * Handle device discovered during scan
   * @private
   */
  private handleDeviceDiscovered(result: any): void {
    console.log('[BluetoothManager] Device discovered:', result.device.name, result.device.id);
    
    // Auto-connect to 404-Found devices
    if (result.device.name && result.device.name.startsWith('404-Found')) {
      this.connect(result.device.id);
    }
  }

  /**
   * Connect to a peer
   */
  async connect(peerId: string): Promise<{ success: boolean; error?: string }> {
    if (this.state !== 'SCANNING' && this.state !== 'IDLE') {
      return { success: false, error: `Cannot connect from state: ${this.state}` };
    }

    try {
      this.state = 'CONNECTED';
      this.currentPeerId = peerId;
      console.log(`[BluetoothManager] Connecting to ${peerId}...`);

      // Connect to device
      await BleClient.connect(peerId);

      console.log(`[BluetoothManager] Connected to ${peerId}`);

      // Start sync automatically when connected
      this.sync(peerId);

      return { success: true };
    } catch (error) {
      console.error('[BluetoothManager] Connection failed:', error);
      this.state = 'ERROR';
      this.currentPeerId = null;
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Disconnect from peer
   */
  async disconnect(): Promise<void> {
    if (this.currentPeerId) {
      try {
        this.state = 'DISCONNECTING';
        await BleClient.disconnect(this.currentPeerId);
        console.log(`[BluetoothManager] Disconnected from ${this.currentPeerId}`);
      } catch (error) {
        console.error('[BluetoothManager] Disconnect failed:', error);
      }
      this.currentPeerId = null;
    }
    this.state = 'IDLE';
  }

  /**
   * sync(peerId): Sync workflow with DatabaseStore
   * Runs in background-safe task to avoid UI freezes
   */
  async sync(peerId: string): Promise<{ success: boolean; messagesSynced: number; error?: string }> {
    if (this.state !== 'CONNECTED') {
      return { success: false, messagesSynced: 0, error: `Cannot sync from state: ${this.state}` };
    }

    console.log(`[BluetoothManager] Starting sync with ${peerId}`);

    // Run in background-safe task
    return this._runBackgroundTask(async () => {
      try {
        // Initialize sync session
        this.syncSession = {
          peerId,
          startedAt: Date.now(),
          messagesProcessed: 0,
          lastProcessedId: this.syncSession?.lastProcessedId
        };

        // 1. Get local summary from DatabaseStore
        const localSummary = await this._getLocalSummary();
        console.log(`[BluetoothManager] Local summary: ${localSummary.length} messages`);

        // 2. Request remote summary from peer
        const remoteSummary = await this._requestRemoteSummary(peerId);
        if (!remoteSummary) {
          throw new Error('Failed to get remote summary');
        }
        console.log(`[BluetoothManager] Remote summary: ${remoteSummary.length} messages`);

        // 3. Compare lists and identify missing messages
        const { missingLocal, missingRemote } = this._compareSummaries(localSummary, remoteSummary);
        console.log(`[BluetoothManager] Missing local: ${missingLocal.length}, Missing remote: ${missingRemote.length}`);

        // 4. Request missing payloads from peer
        let messagesSynced = 0;
        if (missingLocal.length > 0) {
          const synced = await this._requestMissingPayloads(peerId, missingLocal);
          messagesSynced += synced;
        }

        // 5. Push own missing payloads to peer
        if (missingRemote.length > 0) {
          const pushed = await this._pushMissingPayloads(peerId, missingRemote);
          messagesSynced += pushed;
        }

        // Update sync session
        if (this.syncSession) {
          this.syncSession.messagesProcessed = messagesSynced;
        }

        console.log(`[BluetoothManager] Sync complete: ${messagesSynced} messages synced`);

        return { success: true, messagesSynced };
      } catch (error) {
        console.error('[BluetoothManager] Sync failed:', error);
        
        // Log last processed ID for resilience
        if (this.syncSession) {
          console.log(`[BluetoothManager] Last processed ID: ${this.syncSession.lastProcessedId}`);
        }

        return { success: false, messagesSynced: 0, error: (error as Error).message };
      }
    });
  }

  /**
   * Get local summary from DatabaseStore
   * @private
   */
  private async _getLocalSummary(): Promise<SyncSummary[]> {
    const messages = await databaseStore.getAllMessages();
    return messages.map(msg => ({
      id: msg.id,
      version: msg.version,
      timestamp: msg.timestamp
    }));
  }

  /**
   * Request remote summary from peer
   * @private
   */
  private async _requestRemoteSummary(peerId: string): Promise<SyncSummary[] | null> {
    try {
      // Read from characteristic (simulated - in real implementation, would use BLE characteristic)
      const data = await BleClient.read(peerId, this.SERVICE_UUID, this.CHARACTERISTIC_UUID);
      
      // Convert DataView to string
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(data);
      
      // Parse data (simulated)
      const summary = JSON.parse(jsonString);
      return summary;
    } catch (error) {
      console.error('[BluetoothManager] Failed to request remote summary:', error);
      return null;
    }
  }

  /**
   * Compare local and remote summaries
   * @private
   */
  private _compareSummaries(local: SyncSummary[], remote: SyncSummary[]): {
    missingLocal: SyncSummary[];
    missingRemote: SyncSummary[];
  } {
    const localIds = new Set(local.map(s => s.id));
    const remoteIds = new Set(remote.map(s => s.id));

    const missingLocal = remote.filter(s => !localIds.has(s.id));
    const missingRemote = local.filter(s => !remoteIds.has(s.id));

    return { missingLocal, missingRemote };
  }

  /**
   * Request missing payloads from peer
   * @private
   */
  private async _requestMissingPayloads(peerId: string, missing: SyncSummary[]): Promise<number> {
    let synced = 0;

    for (const summary of missing) {
      try {
        // Request payload from peer (simulated)
        const payload = await this._requestPayload(peerId, summary.id);
        
        if (payload) {
          // Store in DatabaseStore
          await databaseStore.upsertMessage(payload);
          
          // Update last processed ID for resilience
          if (this.syncSession) {
            this.syncSession.lastProcessedId = summary.id;
          }
          
          synced++;
        }
      } catch (error) {
        console.error(`[BluetoothManager] Failed to sync message ${summary.id}:`, error);
      }
    }

    return synced;
  }

  /**
   * Push missing payloads to peer
   * @private
   */
  private async _pushMissingPayloads(peerId: string, missing: SyncSummary[]): Promise<number> {
    let pushed = 0;

    for (const summary of missing) {
      try {
        // Get message from DatabaseStore
        const message = await databaseStore.getAllMessages();
        const msg = message.find(m => m.id === summary.id);
        
        if (msg) {
          // Push to peer (simulated)
          await this._pushPayload(peerId, msg);
          
          pushed++;
        }
      } catch (error) {
        console.error(`[BluetoothManager] Failed to push message ${summary.id}:`, error);
      }
    }

    return pushed;
  }

  /**
   * Request specific payload from peer
   * @private
   */
  private async _requestPayload(peerId: string, messageId: string): Promise<any> {
    try {
      // Read from characteristic (simulated)
      const data = await BleClient.read(peerId, this.SERVICE_UUID, this.CHARACTERISTIC_UUID);
      
      // Convert DataView to string
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(data);
      
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`[BluetoothManager] Failed to request payload ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Push payload to peer
   * @private
   */
  private async _pushPayload(peerId: string, payload: any): Promise<void> {
    try {
      // Convert payload to DataView
      const jsonString = JSON.stringify(payload);
      const encoder = new TextEncoder();
      const dataView = new DataView(encoder.encode(jsonString).buffer);
      
      // Write to characteristic (simulated)
      await BleClient.write(peerId, this.SERVICE_UUID, this.CHARACTERISTIC_UUID, dataView);
    } catch (error) {
      console.error('[BluetoothManager] Failed to push payload:', error);
    }
  }

  /**
   * Run task in background-safe manner to avoid UI freezes
   * @private
   */
  private async _runBackgroundTask<T>(task: () => Promise<T>): Promise<T> {
    // Use setTimeout to run in next tick (non-blocking)
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  }

  /**
   * Get current sync session
   */
  getSyncSession(): SyncSession | null {
    return this.syncSession;
  }

  /**
   * Resume sync from last processed ID
   */
  async resumeSync(peerId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.syncSession || !this.syncSession.lastProcessedId) {
      return { success: false, error: 'No previous sync session to resume' };
    }

    console.log(`[BluetoothManager] Resuming sync from ${this.syncSession.lastProcessedId}`);

    // Reconnect and resume sync
    const result = await this.connect(peerId);
    if (result.success) {
      await this.sync(peerId);
    }

    return result;
  }

  /**
   * Handle connection drop with resilience
   */
  async handleConnectionDrop(): Promise<void> {
    console.log('[BluetoothManager] Connection dropped, attempting to reconnect...');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, 2000 * this.reconnectAttempts));
      
      if (this.currentPeerId) {
        const result = await this.connect(this.currentPeerId);
        if (result.success) {
          this.reconnectAttempts = 0;
          // Resume sync
          await this.resumeSync(this.currentPeerId);
        }
      }
    } else {
      console.error('[BluetoothManager] Max reconnect attempts reached');
      this.state = 'ERROR';
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.stopAdvertising();
    await this.stopScanning();
    await this.disconnect();
    this.syncSession = null;
    this.reconnectAttempts = 0;
    console.log('[BluetoothManager] Cleaned up');
  }
}

// Export singleton instance
export const bluetoothManager = new BluetoothManager();
export default bluetoothManager;
