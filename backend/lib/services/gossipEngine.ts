/**
 * GossipEngine - P2P Mesh Networking Protocol for 404 Found
 * Implements efficient message synchronization between mesh peers
 */

import { db, Message } from '../db';
import { meshSync } from './meshSync';

// Types for gossip protocol
type MessageId = string | number;

interface MessageSummary {
  id: MessageId;
  localId?: string;
  timestamp: Date | string;
  type: string;
  hash?: string; // Optional content hash for integrity
}

interface PeerSummary {
  peerId: string;
  messages: MessageSummary[];
  lastSync?: Date;
}

interface SyncDelta {
  missingLocally: MessageId[]; // IDs peer has, we don't
  missingRemotely: MessageId[]; // IDs we have, peer doesn't
  conflicting: MessageId[]; // Same ID, different timestamps
}

interface SyncRequest {
  fromPeer: string;
  toPeer: string;
  requestedIds: MessageId[];
  timestamp: Date;
}

type PeerEventType = 'peer_connected' | 'peer_disconnected' | 'data_received';

interface PeerEvent {
  type: PeerEventType;
  peerId: string;
  data?: any;
}

type GossipListener = (event: PeerEvent) => void;

class GossipEngine {
  private static instance: GossipEngine;
  private nodeId: string;
  private listeners: Set<GossipListener>;
  private activeSyncs: Map<string, boolean>; // Track ongoing syncs per peer
  private syncDebounceTimers: Map<string, NodeJS.Timeout>;

  private constructor() {
    this.nodeId = this.generateNodeId();
    this.listeners = new Set();
    this.activeSyncs = new Map();
    this.syncDebounceTimers = new Map();
    
    console.log(`404 FOUND: [GOSSIP_ENGINE] Initialized with node ID: ${this.nodeId}`);
  }

  static getInstance(): GossipEngine {
    if (!GossipEngine.instance) {
      GossipEngine.instance = new GossipEngine();
    }
    return GossipEngine.instance;
  }

  // Generate unique node ID
  private generateNodeId(): string {
    return `node-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Message Summary Protocol
   * Retrieves all message IDs and timestamps for efficient sync
   */
  async generateSummary(): Promise<MessageSummary[]> {
    try {
      const messages = await db.messages.toArray();
      
      const summary = messages.map((msg: Message) => ({
        id: msg.id ?? msg.localId ?? 'unknown',
        localId: msg.localId,
        timestamp: msg.timestamp,
        type: msg.type,
        // Simple hash for content validation (optional)
        hash: this.simpleHash(`${msg.title}${msg.description}${msg.timestamp}`),
      }));

      console.log(`404 FOUND: [GOSSIP_SUMMARY] Generated summary with ${summary.length} messages`);
      return summary;
    } catch (error) {
      console.error('404 FOUND: [GOSSIP_ERROR] Failed to generate summary:', error);
      return [];
    }
  }

  // Simple content hash for integrity checking
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substr(0, 8);
  }

  /**
   * Sync Handshake Logic
   * Compares peer summary against local database and identifies delta
   */
  async initiateSync(peerSummary: PeerSummary): Promise<SyncDelta> {
    const localSummary = await this.generateSummary();
    
    console.log(`404 FOUND: [GOSSIP_SYNC] Initiating sync with peer: ${peerSummary.peerId}`);
    console.log(`  Local: ${localSummary.length} messages, Peer: ${peerSummary.messages.length} messages`);

    // Create lookup maps for efficiency
    const localMap = new Map<MessageId, MessageSummary>();
    localSummary.forEach(msg => {
      localMap.set(msg.id, msg);
      if (msg.localId) localMap.set(msg.localId, msg);
    });

    const peerMap = new Map<MessageId, MessageSummary>();
    peerSummary.messages.forEach(msg => {
      peerMap.set(msg.id, msg);
      if (msg.localId) peerMap.set(msg.localId, msg);
    });

    // Calculate delta
    const missingLocally: MessageId[] = [];
    const missingRemotely: MessageId[] = [];
    const conflicting: MessageId[] = [];

    // Find messages peer has that we don't
    peerSummary.messages.forEach(peerMsg => {
      const localMsg = localMap.get(peerMsg.id) || localMap.get(peerMsg.localId || '');
      
      if (!localMsg) {
        missingLocally.push(peerMsg.id);
      } else if (localMsg.hash !== peerMsg.hash) {
        // Same ID, different content (potential conflict)
        conflicting.push(peerMsg.id);
      }
    });

    // Find messages we have that peer doesn't
    localSummary.forEach(localMsg => {
      const peerMsg = peerMap.get(localMsg.id) || peerMap.get(localMsg.localId || '');
      
      if (!peerMsg) {
        missingRemotely.push(localMsg.id);
      }
    });

    const delta: SyncDelta = {
      missingLocally,
      missingRemotely,
      conflicting,
    };

    console.log(`404 FOUND: [GOSSIP_DELTA] Missing locally: ${missingLocally.length}, Missing remotely: ${missingRemotely.length}, Conflicts: ${conflicting.length}`);

    // Trigger automatic sync request for missing messages
    if (missingLocally.length > 0) {
      await this.requestDelta(peerSummary.peerId, missingLocally);
    }

    // If we have messages peer doesn't, notify them (optional bidirectional)
    if (missingRemotely.length > 0) {
      this.notifyPeerOfMissing(peerSummary.peerId, missingRemotely);
    }

    return delta;
  }

  /**
   * Request missing messages from peer
   */
  async requestDelta(peerId: string, missingIds: MessageId[]): Promise<void> {
    const request: SyncRequest = {
      fromPeer: this.nodeId,
      toPeer: peerId,
      requestedIds: missingIds,
      timestamp: new Date(),
    };

    console.log(`404 FOUND: [GOSSIP_REQUEST] Requesting ${missingIds.length} messages from peer ${peerId}`);
    console.log(`  Requested IDs: ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? '...' : ''}`);

    // If many messages requested, suggest batching
    if (missingIds.length > 10) {
      console.log(`404 FOUND: [GOSSIP_REQUEST] Large request (${missingIds.length}), will be batched`);
    }

    // Emit event for Bluetooth/WebRTC layer to handle
    this.emitEvent({
      type: 'data_received',
      peerId,
      data: { type: 'SYNC_REQUEST', payload: request },
    });
  }

  /**
   * Notify peer that we have messages they're missing
   */
  private notifyPeerOfMissing(peerId: string, missingIds: MessageId[]): void {
    console.log(`404 FOUND: [GOSSIP_NOTIFY] Peer ${peerId} is missing ${missingIds.length} messages we have`);
    
    // Emit event - peer can request these if they want
    this.emitEvent({
      type: 'data_received',
      peerId,
      data: { type: 'AVAILABILITY_NOTICE', availableIds: missingIds },
    });
  }

  /**
   * Delta Push - Process incoming messages from peer
   */
  async processIncomingDelta(messages: any[]): Promise<{
    processed: number;
    conflicts: number;
    errors: number;
  }> {
    const result = {
      processed: 0,
      conflicts: 0,
      errors: 0,
    };

    console.log(`404 FOUND: [GOSSIP_RECEIVE] Processing ${messages.length} incoming messages`);

    for (const msg of messages) {
      try {
        // Use existing meshSync processIncomingMessage for validation/deduplication
        const outcome = await meshSync.processIncomingMessage(msg);
        
        switch (outcome.action) {
          case 'INSERTED':
          case 'UPDATED':
            result.processed++;
            break;
          case 'CONFLICT':
            result.conflicts++;
            break;
          case 'IGNORED':
            // Duplicate or older version - already counted
            break;
        }
      } catch (error) {
        console.error('404 FOUND: [GOSSIP_ERROR] Failed to process message:', error);
        result.errors++;
      }
    }

    console.log(`404 FOUND: [GOSSIP_RESULT] Processed: ${result.processed}, Conflicts: ${result.conflicts}, Errors: ${result.errors}`);
    return result;
  }

  /**
   * Prepare messages to send to peer (Delta Push) with batching
   * Returns messages in batches of 10 for efficient transfer
   */
  async prepareDelta(messageIds: MessageId[]): Promise<any[][]> {
    try {
      const allMessages: any[] = [];
      
      for (const id of messageIds) {
        // Try to find by id or localId
        let msg = await db.messages.get(id as number);
        
        if (!msg) {
          const byLocalId = await db.messages.where('localId').equals(id as string).first();
          if (byLocalId) msg = byLocalId;
        }
        
        if (msg) {
          allMessages.push({
            ...msg,
            _syncSource: this.nodeId,
            _syncTimestamp: new Date().toISOString(),
          });
        }
      }

      // Split into batches of 10 for efficient transfer
      const BATCH_SIZE = 10;
      const batches: any[][] = [];
      for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
        batches.push(allMessages.slice(i, i + BATCH_SIZE));
      }

      console.log(`404 FOUND: [GOSSIP_PREPARE] Prepared ${allMessages.length} messages in ${batches.length} batches`);
      return batches;
    } catch (error) {
      console.error('404 FOUND: [GOSSIP_ERROR] Failed to prepare delta:', error);
      return [];
    }
  }

  /**
   * Process incoming batch messages
   */
  async processIncomingBatch(
    batchIndex: number, 
    totalBatches: number, 
    messages: any[]
  ): Promise<{ processed: number; pending: number }> {
    console.log(`404 FOUND: [GOSSIP_BATCH] Received batch ${batchIndex + 1}/${totalBatches} with ${messages.length} messages`);
    
    const result = await this.processIncomingDelta(messages);
    
    return {
      processed: result.processed,
      pending: totalBatches - batchIndex - 1,
    };
  }

  /**
   * Event System - Subscribe to peer events
   */
  subscribe(listener: GossipListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: PeerEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('404 FOUND: [GOSSIP_ERROR] Listener failed:', error);
      }
    });
  }

  /**
   * Gossip Loop - React to peer connections
   */
  onPeerConnected(peerId: string): void {
    console.log(`404 FOUND: [GOSSIP_PEER] Peer connected: ${peerId}`);
    
    // Debounce rapid connection events
    const existingTimer = this.syncDebounceTimers.get(peerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Emit peer connected event
    this.emitEvent({
      type: 'peer_connected',
      peerId,
    });

    // Auto-initiate sync after short delay (allow connection to stabilize)
    const timer = setTimeout(async () => {
      if (this.activeSyncs.get(peerId)) {
        console.log(`404 FOUND: [GOSSIP_SYNC] Sync already in progress for ${peerId}`);
        return;
      }

      this.activeSyncs.set(peerId, true);
      
      try {
        // Generate our summary
        const summary = await this.generateSummary();
        
        // Request peer's summary
        this.emitEvent({
          type: 'data_received',
          peerId,
          data: {
            type: 'SUMMARY_REQUEST',
            payload: {
              peerId: this.nodeId,
              messages: summary,
            },
          },
        });
      } catch (error) {
        console.error(`404 FOUND: [GOSSIP_ERROR] Failed to initiate sync with ${peerId}:`, error);
      } finally {
        this.activeSyncs.delete(peerId);
      }
    }, 500); // 500ms debounce

    this.syncDebounceTimers.set(peerId, timer);
  }

  onPeerDisconnected(peerId: string): void {
    console.log(`404 FOUND: [GOSSIP_PEER] Peer disconnected: ${peerId}`);
    
    // Clear any pending sync
    const timer = this.syncDebounceTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.syncDebounceTimers.delete(peerId);
    }
    
    this.activeSyncs.delete(peerId);
    
    this.emitEvent({
      type: 'peer_disconnected',
      peerId,
    });
  }

  /**
   * Handle incoming data from transport layer (Bluetooth/WebRTC)
   */
  async handleIncomingData(peerId: string, data: any): Promise<void> {
    if (!data || !data.type) {
      console.warn('404 FOUND: [GOSSIP_WARN] Received malformed data');
      return;
    }

    console.log(`404 FOUND: [GOSSIP_RECEIVE] ${data.type} from ${peerId}`);

    switch (data.type) {
      case 'SUMMARY_REQUEST':
        // Peer sent us their summary, calculate delta
        if (data.payload && data.payload.messages) {
          await this.initiateSync(data.payload);
        }
        break;

      case 'SYNC_REQUEST':
        // Peer is requesting specific messages - prepare in batches
        if (data.payload && data.payload.requestedIds) {
          const batches = await this.prepareDelta(data.payload.requestedIds);
          
          // Send batches back to peer via transport layer
          for (let i = 0; i < batches.length; i++) {
            this.emitEvent({
              type: 'data_received',
              peerId,
              data: {
                type: 'BATCH_MESSAGES',
                batchIndex: i,
                totalBatches: batches.length,
                messages: batches[i],
              },
            });
            
            // Add small delay between batches to prevent overwhelming
            if (i < batches.length - 1) {
              await this.delay(100);
            }
          }
        }
        break;

      case 'BATCH_MESSAGES':
        // Received a batch of messages
        if (data.messages && Array.isArray(data.messages)) {
          const batchIndex = data.batchIndex || 0;
          const totalBatches = data.totalBatches || 1;
          
          await this.processIncomingBatch(batchIndex, totalBatches, data.messages);
          
          // Show progress
          if (batchIndex < totalBatches - 1) {
            console.log(`404 FOUND: [GOSSIP_PROGRESS] ${totalBatches - batchIndex - 1} batches remaining...`);
          } else {
            console.log('404 FOUND: [GOSSIP_COMPLETE] All batches received');
          }
        }
        break;

      case 'DELTA_PUSH':
        // Legacy: Received all messages at once (deprecated, use BATCH_MESSAGES)
        if (Array.isArray(data.payload)) {
          console.warn('404 FOUND: [GOSSIP_WARN] Received DELTA_PUSH, consider using BATCH_MESSAGES for large payloads');
          await this.processIncomingDelta(data.payload);
        }
        break;

      case 'AVAILABILITY_NOTICE':
        // Peer has messages we don't have
        if (data.availableIds && data.availableIds.length > 0) {
          // Auto-request if we want them
          await this.requestDelta(peerId, data.availableIds);
        }
        break;

      default:
        console.warn(`404 FOUND: [GOSSIP_WARN] Unknown message type: ${data.type}`);
    }
  }

  /**
   * Get current peer count (for UI)
   */
  getActivePeerCount(): number {
    return this.activeSyncs.size;
  }

  /**
   * Utility delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const gossipEngine = GossipEngine.getInstance();
export default gossipEngine;

// Export types
export type {
  MessageSummary,
  PeerSummary,
  SyncDelta,
  SyncRequest,
  PeerEvent,
  PeerEventType,
  GossipListener,
};
