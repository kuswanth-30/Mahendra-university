/**
 * MeshSync - Conflict Resolution for 404 Found Offline Mesh
 * Handles incoming messages with Last-Write-Wins and manual conflict resolution
 */

import { db, Message } from '../db';

// Conflict types
export interface ConflictRecord {
  id: string;
  localRecord: Message;
  remoteRecord: any;
  timestamp: Date;
  resolved: boolean;
  resolution?: 'LOCAL' | 'REMOTE';
}

// Conflict resolution callbacks
type ConflictCallback = (conflict: ConflictRecord) => void;

class MeshSync {
  private static instance: MeshSync;
  private conflictListeners: Set<ConflictCallback>;
  private pendingConflicts: Map<string, ConflictRecord>;

  private constructor() {
    this.conflictListeners = new Set();
    this.pendingConflicts = new Map();
  }

  static getInstance(): MeshSync {
    if (!MeshSync.instance) {
      MeshSync.instance = new MeshSync();
    }
    return MeshSync.instance;
  }

  // Subscribe to conflict events
  subscribe(callback: ConflictCallback): () => void {
    this.conflictListeners.add(callback);
    
    // Notify of any pending conflicts immediately
    this.pendingConflicts.forEach(conflict => {
      if (!conflict.resolved) {
        callback(conflict);
      }
    });

    return () => {
      this.conflictListeners.delete(callback);
    };
  }

  // Notify all listeners of new conflict
  private notifyConflict(conflict: ConflictRecord): void {
    console.log('404 FOUND: [CONFLICT_DETECTED]', conflict.id);
    this.conflictListeners.forEach(callback => callback(conflict));
  }

  /**
   * Process Incoming Message - Main Entry Point
   * Non-blocking conflict detection and resolution
   */
  async processIncomingMessage(remoteMsg: any): Promise<{
    action: 'INSERTED' | 'UPDATED' | 'CONFLICT' | 'IGNORED';
    messageId: string;
  }> {
    const messageId = remoteMsg.id || remoteMsg.localId;
    
    if (!messageId) {
      console.warn('404 FOUND: [MESH_SYNC] Incoming message has no ID');
      return { action: 'IGNORED', messageId: 'unknown' };
    }

    console.log('404 FOUND: [MESH_SYNC] Processing incoming message', messageId);

    try {
      // Check for existing local message
      const existingLocal = await this.findLocalMessage(messageId);

      if (!existingLocal) {
        // No conflict - insert new message
        await this.insertMessage(remoteMsg);
        return { action: 'INSERTED', messageId };
      }

      // Conflict detection
      const remoteTime = new Date(remoteMsg.timestamp).getTime();
      const localTime = new Date(existingLocal.timestamp).getTime();

      // Resolution Logic
      if (remoteTime > localTime) {
        // Remote is newer - LWW
        console.log('404 FOUND: [MESH_SYNC] Remote is newer, updating local');
        await this.updateMessage(existingLocal.id!, remoteMsg);
        return { action: 'UPDATED', messageId };
      }

      if (remoteTime < localTime) {
        // Local is newer - ignore remote
        console.log('404 FOUND: [MESH_SYNC] Local is newer, ignoring remote');
        return { action: 'IGNORED', messageId };
      }

      // Timestamps are equal - check content
      if (this.isContentEqual(existingLocal, remoteMsg)) {
        // Same content, no conflict
        console.log('404 FOUND: [MESH_SYNC] Identical content, no conflict');
        return { action: 'IGNORED', messageId };
      }

      // CONFLICT: Same timestamp, different content
      console.log('404 FOUND: [MESH_SYNC] Conflict detected - equal timestamps, different content');
      
      // Create conflict record (non-blocking)
      this.createConflict(existingLocal, remoteMsg);
      
      return { action: 'CONFLICT', messageId };

    } catch (error) {
      console.error('404 FOUND: [MESH_SYNC_ERROR]', error);
      return { action: 'IGNORED', messageId };
    }
  }

  // Find local message by ID or localId
  private async findLocalMessage(id: string): Promise<Message | undefined> {
    // Try by primary key first
    const byId = await db.messages.get(parseInt(id));
    if (byId) return byId;

    // Try by localId
    const byLocalId = await db.messages
      .where('localId')
      .equals(id)
      .first();
    
    return byLocalId;
  }

  // Check if content is equal
  private isContentEqual(local: Message, remote: any): boolean {
    return local.title === remote.title && 
           local.description === remote.description &&
           local.type === remote.type;
  }

  // Insert new message
  private async insertMessage(remoteMsg: any): Promise<void> {
    const newMessage: Message = {
      type: remoteMsg.type || 'news',
      title: remoteMsg.title,
      description: remoteMsg.description,
      timestamp: new Date(remoteMsg.timestamp),
      synced: true,
      localId: remoteMsg.localId || remoteMsg.id,
    };

    await db.messages.add(newMessage);
  }

  // Update existing message
  private async updateMessage(localId: number, remoteMsg: any): Promise<void> {
    await db.messages.update(localId, {
      title: remoteMsg.title,
      description: remoteMsg.description,
      timestamp: new Date(remoteMsg.timestamp),
      synced: true,
    });
  }

  // Create conflict record and notify UI
  private createConflict(localRecord: Message, remoteRecord: any): void {
    const conflictId = `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const conflict: ConflictRecord = {
      id: conflictId,
      localRecord,
      remoteRecord,
      timestamp: new Date(),
      resolved: false,
    };

    // Store in pending conflicts
    this.pendingConflicts.set(conflictId, conflict);

    // Log to sync_errors for debugging
    db.syncErrors.add({
      outboxId: localRecord.id || 0,
      actionType: 'CONFLICT',
      error: `Content conflict for message ${localRecord.localId || localRecord.id}`,
      timestamp: new Date(),
      resolved: false,
    } as any).catch(console.error);

    // Notify UI (non-blocking)
    this.notifyConflict(conflict);

    // Auto-resolve after 30 seconds if ignored (default to LWW - remote wins on equal timestamp)
    setTimeout(() => {
      this.autoResolveConflict(conflictId);
    }, 30000);
  }

  // Auto-resolve conflict (default to LWW)
  private async autoResolveConflict(conflictId: string): Promise<void> {
    const conflict = this.pendingConflicts.get(conflictId);
    
    if (!conflict || conflict.resolved) {
      return; // Already resolved or doesn't exist
    }

    console.log('404 FOUND: [CONFLICT_AUTO_RESOLVE] Defaulting to remote (LWW)');
    
    // Default to remote (LWW on equal timestamps means remote wins)
    await this.resolveConflict(conflictId, 'REMOTE');
  }

  /**
   * Manual Conflict Resolution
   * Called by UI when user makes choice
   */
  async resolveConflict(
    conflictId: string, 
    resolution: 'LOCAL' | 'REMOTE'
  ): Promise<boolean> {
    const conflict = this.pendingConflicts.get(conflictId);
    
    if (!conflict) {
      console.warn('404 FOUND: [CONFLICT_RESOLVE] Conflict not found', conflictId);
      return false;
    }

    if (conflict.resolved) {
      console.warn('404 FOUND: [CONFLICT_RESOLVE] Conflict already resolved');
      return false;
    }

    console.log('404 FOUND: [CONFLICT_RESOLVE] User chose:', resolution);

    try {
      if (resolution === 'REMOTE') {
        // Apply remote version
        if (conflict.localRecord.id) {
          await this.updateMessage(conflict.localRecord.id, conflict.remoteRecord);
        }
      } else {
        // Keep local - just mark as synced
        if (conflict.localRecord.id) {
          await db.messages.update(conflict.localRecord.id, { synced: true });
        }
      }

      // Mark as resolved
      conflict.resolved = true;
      conflict.resolution = resolution;
      
      // Update sync_errors
      await db.syncErrors
        .where('actionType')
        .equals('CONFLICT')
        .and(err => err.outboxId === conflict.localRecord.id)
        .modify({ resolved: true });

      // Remove from pending after a delay
      setTimeout(() => {
        this.pendingConflicts.delete(conflictId);
      }, 5000);

      return true;

    } catch (error) {
      console.error('404 FOUND: [CONFLICT_RESOLVE_ERROR]', error);
      return false;
    }
  }

  // Get all pending conflicts
  getPendingConflicts(): ConflictRecord[] {
    return Array.from(this.pendingConflicts.values())
      .filter(c => !c.resolved);
  }

  // Check if has active conflicts
  hasActiveConflicts(): boolean {
    return this.getPendingConflicts().length > 0;
  }

  // Clear all conflicts (for testing/debugging)
  async clearAllConflicts(): Promise<void> {
    for (const [id, conflict] of this.pendingConflicts) {
      if (!conflict.resolved) {
        await this.resolveConflict(id, 'REMOTE');
      }
    }
    this.pendingConflicts.clear();
  }
}

// Export singleton
export const meshSync = MeshSync.getInstance();
export default meshSync;
