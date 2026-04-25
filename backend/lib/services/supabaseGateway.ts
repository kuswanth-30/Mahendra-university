/**
 * SupabaseGateway - Offline-Resilient Supabase Wrapper
 * All Supabase calls must go through this gateway for offline support
 */

import { db, OutboxItem } from '../db';
import { syncEngine } from './syncEngine';

// Supabase query types
export type SupabaseTable = 'messages' | 'alerts' | 'users' | 'sync' | 'mesh_nodes';
export type SupabaseOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface SupabaseQuery {
  table: SupabaseTable;
  operation: SupabaseOperation;
  data?: any;
  filters?: Record<string, any>;
  options?: {
    single?: boolean;
    count?: 'exact' | 'planned' | 'estimated';
    order?: { column: string; ascending?: boolean };
    limit?: number;
  };
}

interface GatewayResult<T = any> {
  status: 'SUCCESS' | 'QUEUED' | 'FAILED' | 'OFFLINE';
  data?: T;
  error?: string;
  outboxId?: number;
  cached?: boolean;
}

class SupabaseGateway {
  private static instance: SupabaseGateway;
  private supabaseClient: any = null;

  private constructor() {}

  static getInstance(): SupabaseGateway {
    if (!SupabaseGateway.instance) {
      SupabaseGateway.instance = new SupabaseGateway();
    }
    return SupabaseGateway.instance;
  }

  // Initialize with Supabase client (call this in your app initialization)
  initialize(supabaseClient: any): void {
    this.supabaseClient = supabaseClient;
    console.log('404 FOUND: [SUPABASE_GATEWAY] Initialized');
  }

  /**
   * Main Gateway Method - All Supabase calls go through here
   */
  async execute<T = any>(query: SupabaseQuery): Promise<GatewayResult<T>> {
    // Check network status
    if (!navigator.onLine) {
      console.log('404 FOUND: [SUPABASE_GATEWAY] Device offline, queueing query');
      return this.queueToOutbox(query);
    }

    try {
      // Attempt online execution
      const result = await this.executeOnline<T>(query);
      
      if (result.status === 'SUCCESS') {
        return result;
      }

      // If online execution failed, queue to outbox
      if (result.status === 'FAILED') {
        console.log('404 FOUND: [SUPABASE_GATEWAY] Online execution failed, queueing for retry');
        return this.queueToOutbox(query, result.error);
      }

      return result;

    } catch (error) {
      // Unexpected error - queue to outbox
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('404 FOUND: [SUPABASE_GATEWAY] Exception:', errorMsg);
      return this.queueToOutbox(query, errorMsg);
    }
  }

  /**
   * Execute query online via Supabase
   */
  private async executeOnline<T>(query: SupabaseQuery): Promise<GatewayResult<T>> {
    if (!this.supabaseClient) {
      return {
        status: 'FAILED',
        error: 'Supabase client not initialized',
      };
    }

    // Add timeout handling
    const timeoutMs = 10000; // 10 second timeout
    
    try {
      let supabaseQuery;

      // Build the query based on operation
      switch (query.operation) {
        case 'select':
          supabaseQuery = this.supabaseClient
            .from(query.table)
            .select(query.options?.single ? '*' : '*', { count: query.options?.count });
          
          // Apply filters
          if (query.filters) {
            Object.entries(query.filters).forEach(([key, value]) => {
              supabaseQuery = supabaseQuery.eq(key, value);
            });
          }
          
          // Apply ordering
          if (query.options?.order) {
            supabaseQuery = supabaseQuery.order(
              query.options.order.column, 
              { ascending: query.options.order.ascending ?? true }
            );
          }
          
          // Apply limit
          if (query.options?.limit) {
            supabaseQuery = supabaseQuery.limit(query.options.limit);
          }
          
          break;

        case 'insert':
          supabaseQuery = this.supabaseClient
            .from(query.table)
            .insert(query.data);
          break;

        case 'update':
          supabaseQuery = this.supabaseClient
            .from(query.table)
            .update(query.data);
          
          // Apply filters for update
          if (query.filters) {
            Object.entries(query.filters).forEach(([key, value]) => {
              supabaseQuery = supabaseQuery.eq(key, value);
            });
          }
          break;

        case 'delete':
          supabaseQuery = this.supabaseClient
            .from(query.table)
            .delete();
          
          // Apply filters for delete
          if (query.filters) {
            Object.entries(query.filters).forEach(([key, value]) => {
              supabaseQuery = supabaseQuery.eq(key, value);
            });
          }
          break;

        case 'upsert':
          supabaseQuery = this.supabaseClient
            .from(query.table)
            .upsert(query.data);
          break;

        default:
          return {
            status: 'FAILED',
            error: `Unknown operation: ${query.operation}`,
          };
      }

      // Execute with timeout
      const { data, error, count } = await Promise.race([
        supabaseQuery,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        ),
      ]) as any;

      if (error) {
        console.error('404 FOUND: [SUPABASE_GATEWAY] Supabase error:', error.message);
        return {
          status: 'FAILED',
          error: error.message,
        };
      }

      console.log('404 FOUND: [SUPABASE_GATEWAY] Success:', query.operation, query.table);

      return {
        status: 'SUCCESS',
        data: query.options?.single ? data : (data || []),
        ...(count !== undefined && { count }),
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Request failed';
      
      // Check if it's a timeout
      if (errorMsg.includes('timeout')) {
        console.error('404 FOUND: [SUPABASE_GATEWAY] Request timeout');
        return {
          status: 'FAILED',
          error: 'Request timeout - network may be unstable',
        };
      }

      return {
        status: 'FAILED',
        error: errorMsg,
      };
    }
  }

  /**
   * Queue query to Dexie outbox for later sync
   */
  private async queueToOutbox(
    query: SupabaseQuery, 
    error?: string
  ): Promise<GatewayResult> {
    // Map Supabase operations to action types
    let actionType: OutboxItem['actionType'];
    
    switch (query.operation) {
      case 'insert':
      case 'upsert':
        actionType = query.table === 'alerts' ? 'BROADCAST_ALERT' : 'POST_MESSAGE';
        break;
      case 'update':
        actionType = 'UPDATE_STATUS';
        break;
      case 'delete':
        actionType = 'UPDATE_STATUS'; // Using UPDATE_STATUS as generic fallback
        break;
      default:
        actionType = 'POST_MESSAGE';
    }

    // Create outbox item
    const outboxItem: OutboxItem = {
      actionType,
      payload: {
        supabaseQuery: query,
        queuedAt: new Date().toISOString(),
        originalError: error,
      },
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 5,
      status: 'PENDING',
      priority: query.table === 'alerts' ? 'high' : 'normal',
      error: error || 'Device offline',
    };

    try {
      const outboxId = await db.outbox.add(outboxItem);
      
      // Also log to sync_errors if this was a failed request
      if (error) {
        await db.syncErrors.add({
          outboxId,
          actionType,
          error: `Supabase ${query.operation} failed: ${error}`,
          timestamp: new Date(),
          resolved: false,
        } as any);
      }

      console.log(`404 FOUND: [SUPABASE_GATEWAY] Queued to outbox (ID: ${outboxId})`);

      // Trigger sync if online (for failed requests that might recover)
      if (navigator.onLine) {
        syncEngine.processOutbox();
      }

      return {
        status: 'QUEUED',
        outboxId,
        error: error || 'Queued for sync when connection restored',
      };

    } catch (dbError) {
      console.error('404 FOUND: [SUPABASE_GATEWAY] Failed to queue to outbox:', dbError);
      return {
        status: 'FAILED',
        error: 'Failed to queue for offline sync',
      };
    }
  }

  /**
   * Convenience methods for common operations
   */
  
  // SELECT / Read
  async from<T = any>(
    table: SupabaseTable,
    options?: {
      filters?: Record<string, any>;
      single?: boolean;
      order?: { column: string; ascending?: boolean };
      limit?: number;
    }
  ): Promise<GatewayResult<T>> {
    return this.execute<T>({
      table,
      operation: 'select',
      filters: options?.filters,
      options: {
        single: options?.single,
        order: options?.order,
        limit: options?.limit,
      },
    });
  }

  // INSERT
  async insert<T = any>(
    table: SupabaseTable,
    data: any
  ): Promise<GatewayResult<T>> {
    return this.execute<T>({
      table,
      operation: 'insert',
      data,
    });
  }

  // UPDATE
  async update<T = any>(
    table: SupabaseTable,
    data: any,
    filters: Record<string, any>
  ): Promise<GatewayResult<T>> {
    return this.execute<T>({
      table,
      operation: 'update',
      data,
      filters,
    });
  }

  // DELETE
  async delete<T = any>(
    table: SupabaseTable,
    filters: Record<string, any>
  ): Promise<GatewayResult<T>> {
    return this.execute<T>({
      table,
      operation: 'delete',
      filters,
    });
  }

  // UPSERT
  async upsert<T = any>(
    table: SupabaseTable,
    data: any
  ): Promise<GatewayResult<T>> {
    return this.execute<T>({
      table,
      operation: 'upsert',
      data,
    });
  }
}

// Export singleton instance
export const supabaseGateway = SupabaseGateway.getInstance();
export default supabaseGateway;
