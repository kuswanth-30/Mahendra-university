import { db } from '../db';
import { cryptoService } from './crypto.js';

/**
 * OutboxManager - Handles offline action queuing and processing
 * Implements store-and-forward pattern for mesh networks.
 */
class OutboxManager {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = 5000; // Check every 5 seconds
    this.handlers = new Map();
  }

  /**
   * Register a handler for a specific action type
   * e.g., 'SEND_MESSAGE', 'SYNC_HASH'
   */
  registerHandler(actionType, handler) {
    this.handlers.set(actionType, handler);
  }

  /**
   * Start the background processing loop
   */
  start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this._processLoop();
    console.log('[OutboxManager] Started processing loop');
  }

  /**
   * Stop the background processing loop
   */
  stop() {
    this.isProcessing = false;
    console.log('[OutboxManager] Stopped processing loop');
  }

  /**
   * Main processing loop
   * @private
   */
  async _processLoop() {
    if (!this.isProcessing) return;

    try {
      await this.processPendingActions();
    } catch (error) {
      console.error('[OutboxManager] Loop error:', error);
    }

    setTimeout(() => this._processLoop(), this.processingInterval);
  }

  /**
   * Processes all pending actions in the outbox
   */
  async processPendingActions() {
    // Transactional read of pending items
    const pendingItems = await db.transaction('r', db.outbox, async () => {
      return await db.outbox.where('status').equals('pending').toArray();
    });

    if (pendingItems.length === 0) return;

    console.log(`[OutboxManager] Processing ${pendingItems.length} pending actions...`);

    for (const item of pendingItems) {
      const handler = this.handlers.get(item.actionType);
      
      if (!handler) {
        console.warn(`[OutboxManager] No handler for action: ${item.actionType}`);
        continue;
      }

      try {
        await db.updateOutboxStatus(item.id, 'processing');
        
        // AUTO-SIGNING MIDDLEWARE: Sign payload before sending
        let payloadToProcess = item.payload;
        if (item.actionType === 'SEND_MESSAGE') {
          payloadToProcess = await cryptoService.signPayload(item.payload);
        }
        
        const success = await handler(payloadToProcess);
        
        if (success) {
          await db.transaction('rw', db.outbox, async () => {
            await db.outbox.update(item.id, { status: 'completed' });
            // Optionally delete completed items to keep DB small
            // await db.outbox.delete(item.id);
          });
        } else {
          await db.updateOutboxStatus(item.id, 'pending'); // Retry later
        }
      } catch (error) {
        console.error(`[OutboxManager] Action ${item.id} failed:`, error);
        await db.updateOutboxStatus(item.id, 'failed');
      }
    }
  }

  /**
   * Queue a new action for processing
   */
  async addAction(actionType, payload) {
    return await db.queueAction(actionType, payload);
  }
}

export const outboxManager = new OutboxManager();
export default outboxManager;
