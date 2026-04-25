import Dexie, { Table } from 'dexie';

// Message type for the main messages table
export interface Message {
  id?: number;
  type: 'alert' | 'news' | 'route' | 'qr' | 'direct';
  title: string;
  description: string;
  timestamp: Date;
  synced: boolean;
  localId?: string; // Client-side generated ID for offline-created messages
}

// Outbox item type for pending actions
export interface OutboxItem {
  id?: number;
  actionType: 'POST_MESSAGE' | 'SCAN_QR' | 'BROADCAST_ALERT' | 'UPDATE_STATUS';
  payload: any;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  status: 'PENDING' | 'PROCESSING' | 'FAILED';
  error?: string;
  priority: 'high' | 'normal' | 'low';
}

// Sync error log type
export interface SyncError {
  id?: number;
  outboxId: number;
  actionType: string;
  error: string;
  errorStack?: string;
  timestamp: Date;
  resolved: boolean;
}

// Network status log for debugging
export interface NetworkStatusLog {
  id?: number;
  status: 'online' | 'offline' | 'syncing' | 'error';
  timestamp: Date;
  details?: string;
}

class FoundDatabase extends Dexie {
  messages!: Table<Message, number>;
  outbox!: Table<OutboxItem, number>;
  syncErrors!: Table<SyncError, number>;
  networkLog!: Table<NetworkStatusLog, number>;

  constructor() {
    super('FoundDB');
    
    this.version(1).stores({
      messages: '++id, type, timestamp, synced, localId',
      outbox: '++id, actionType, timestamp, status, retryCount',
      syncErrors: '++id, outboxId, timestamp, resolved',
      networkLog: '++id, status, timestamp'
    });

    // Hooks for automatic timestamping
    this.outbox.hook('creating', (primKey, obj) => {
      obj.timestamp = new Date();
      obj.retryCount = obj.retryCount || 0;
      obj.maxRetries = obj.maxRetries || 5;
      obj.status = obj.status || 'PENDING';
      obj.priority = obj.priority || 'normal';
    });

    this.syncErrors.hook('creating', (primKey, obj) => {
      obj.timestamp = new Date();
      obj.resolved = obj.resolved || false;
    });

    this.networkLog.hook('creating', (primKey, obj) => {
      obj.timestamp = new Date();
    });
  }

  // Utility: Log network status change
  async logNetworkStatus(status: NetworkStatusLog['status'], details?: string): Promise<void> {
    await this.networkLog.add({ status, details } as NetworkStatusLog);
    
    // Keep only last 100 logs
    const count = await this.networkLog.count();
    if (count > 100) {
      const oldLogs = await this.networkLog
        .orderBy('timestamp')
        .limit(count - 100)
        .toArray();
      await this.networkLog.bulkDelete(oldLogs.map(l => l.id!));
    }
  }

  // Utility: Get pending outbox items
  async getPendingOutboxItems(): Promise<OutboxItem[]> {
    return await this.outbox
      .where('status')
      .equals('PENDING')
      .and(item => item.retryCount < item.maxRetries)
      .sortBy('timestamp');
  }

  // Utility: Get failed items that need retry
  async getRetryableItems(): Promise<OutboxItem[]> {
    return await this.outbox
      .where('status')
      .equals('FAILED')
      .and(item => item.retryCount < item.maxRetries)
      .sortBy('timestamp');
  }

  // Utility: Get stats for UI
  async getOutboxStats(): Promise<{
    pending: number;
    failed: number;
    total: number;
    lastSync?: Date;
  }> {
    const [pending, failed, total] = await Promise.all([
      this.outbox.where('status').equals('PENDING').count(),
      this.outbox.where('status').equals('FAILED').count(),
      this.outbox.count()
    ]);

    const lastItem = await this.outbox.orderBy('timestamp').last();
    
    return {
      pending,
      failed,
      total,
      lastSync: lastItem?.timestamp
    };
  }

  // Clear resolved errors (maintenance)
  async clearResolvedErrors(): Promise<number> {
    const resolved = await this.syncErrors
      .where('resolved')
      .equals(1)
      .toArray();
    
    await this.syncErrors.bulkDelete(resolved.map(e => e.id!));
    return resolved.length;
  }
}

export const db = new FoundDatabase();

// Export singleton instance
export default db;
