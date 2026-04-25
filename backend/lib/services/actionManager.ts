import { db, OutboxItem } from '../db';

// Action execution status
export type ActionStatus = 'SUCCESS' | 'QUEUED' | 'FAILED' | 'OFFLINE';

export interface ActionResult {
  status: ActionStatus;
  data?: any;
  error?: string;
  outboxId?: number;
}

// Network stability check
interface NetworkQuality {
  stable: boolean;
  latency?: number;
  reason?: string;
}

class ActionManager {
  private static instance: ActionManager;
  private isProcessing: boolean = false;
  private networkCheckPromise: Promise<NetworkQuality> | null = null;

  private constructor() {}

  static getInstance(): ActionManager {
    if (!ActionManager.instance) {
      ActionManager.instance = new ActionManager();
    }
    return ActionManager.instance;
  }

  // Check network stability with a lightweight ping
  private async checkNetworkStability(): Promise<NetworkQuality> {
    // Return cached check if recent (< 5 seconds)
    if (this.networkCheckPromise) {
      return this.networkCheckPromise;
    }

    this.networkCheckPromise = this.performNetworkCheck();
    
    // Clear cache after 5 seconds
    setTimeout(() => {
      this.networkCheckPromise = null;
    }, 5000);

    return this.networkCheckPromise;
  }

  private async performNetworkCheck(): Promise<NetworkQuality> {
    // Basic online check
    if (!navigator.onLine) {
      return { stable: false, reason: 'Browser reports offline' };
    }

    try {
      // Try to reach a lightweight endpoint (or use a data URI for local test)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const start = performance.now();
      
      // Use a small data URI or ping a reliable endpoint
      // For demo, we'll check if we can reach the current origin
      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store'
      }).catch(() => {
        // Fallback: assume online if browser reports online
        return { ok: true } as Response;
      });

      clearTimeout(timeout);
      const latency = performance.now() - start;

      if (!response.ok && response.status !== 0) {
        return { stable: false, latency, reason: `HTTP ${response.status}` };
      }

      // Consider unstable if latency > 2 seconds
      if (latency > 2000) {
        return { stable: false, latency, reason: 'High latency' };
      }

      return { stable: true, latency };
    } catch (error) {
      return { stable: false, reason: 'Network check failed' };
    }
  }

  // Main execute action method
  async executeAction(
    actionType: OutboxItem['actionType'],
    payload: any,
    options: {
      priority?: 'high' | 'normal' | 'low';
      maxRetries?: number;
      immediate?: boolean;
    } = {}
  ): Promise<ActionResult> {
    const { priority = 'normal', maxRetries = 5, immediate = false } = options;

    // Always check network first
    const networkQuality = await this.checkNetworkStability();

    // If offline or unstable, queue immediately
    if (!networkQuality.stable && !immediate) {
      const outboxId = await this.queueAction(actionType, payload, {
        priority,
        maxRetries,
        error: networkQuality.reason
      });

      await db.logNetworkStatus('offline', `Action ${actionType} queued: ${networkQuality.reason}`);

      return {
        status: 'QUEUED',
        outboxId,
        error: networkQuality.reason
      };
    }

    // Attempt immediate execution
    try {
      const result = await this.performAction(actionType, payload);
      
      await db.logNetworkStatus('online', `Action ${actionType} completed successfully`);
      
      return {
        status: 'SUCCESS',
        data: result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If execution fails, queue for retry
      const outboxId = await this.queueAction(actionType, payload, {
        priority,
        maxRetries,
        error: errorMessage
      });

      // Log the sync error
      await db.syncErrors.add({
        outboxId,
        actionType,
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        resolved: false
      } as any);

      return {
        status: 'FAILED',
        outboxId,
        error: errorMessage
      };
    }
  }

  // Queue action to outbox
  private async queueAction(
    actionType: OutboxItem['actionType'],
    payload: any,
    options: {
      priority?: 'high' | 'normal' | 'low';
      maxRetries?: number;
      error?: string;
    }
  ): Promise<number> {
    const id = await db.outbox.add({
      actionType,
      payload,
      retryCount: 0,
      maxRetries: options.maxRetries || 5,
      status: 'PENDING',
      priority: options.priority || 'normal',
      error: options.error
    } as OutboxItem);

    return id;
  }

  // Perform the actual action
  private async performAction(actionType: OutboxItem['actionType'], payload: any): Promise<any> {
    switch (actionType) {
      case 'POST_MESSAGE':
        return await this.postMessage(payload);
      
      case 'BROADCAST_ALERT':
        return await this.broadcastAlert(payload);
      
      case 'SCAN_QR':
        return await this.processQRScan(payload);
      
      case 'UPDATE_STATUS':
        return await this.updateStatus(payload);
      
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  // Action implementations
  private async postMessage(payload: any): Promise<any> {
    // Simulate API call
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to post message: ${response.statusText}`);
    }

    return await response.json();
  }

  private async broadcastAlert(payload: any): Promise<any> {
    // Simulate API call with higher priority
    const response = await fetch('/api/alerts/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to broadcast alert: ${response.statusText}`);
    }

    return await response.json();
  }

  private async processQRScan(payload: any): Promise<any> {
    // QR scans are processed locally but logged to server
    await db.messages.add({
      type: 'qr',
      title: `QR: ${payload.data.substring(0, 30)}...`,
      description: `Scanned at ${payload.location || 'Unknown location'}`,
      timestamp: new Date(),
      synced: false,
      localId: `qr-${Date.now()}`
    });

    // Also try to sync to server
    try {
      await fetch('/api/qr/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Non-critical, already saved locally
      console.log('QR sync deferred');
    }

    return { scanned: true, localId: `qr-${Date.now()}` };
  }

  private async updateStatus(payload: any): Promise<any> {
    // Status updates are fire-and-forget
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Silent fail for status updates
    });

    return { updated: true };
  }

  // Get current outbox status for UI
  async getStatus(): Promise<{
    isOnline: boolean;
    isProcessing: boolean;
    pendingCount: number;
    failedCount: number;
  }> {
    const network = await this.checkNetworkStability();
    const stats = await db.getOutboxStats();

    return {
      isOnline: network.stable,
      isProcessing: this.isProcessing,
      pendingCount: stats.pending,
      failedCount: stats.failed
    };
  }
}

export const actionManager = ActionManager.getInstance();
export default actionManager;
