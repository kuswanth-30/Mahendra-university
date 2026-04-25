/**
 * SupabaseGateway Usage Examples
 * 
 * This file shows how to use the offline-resilient Supabase gateway
 * instead of calling supabase directly.
 */

import { supabaseGateway } from './supabaseGateway';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize the gateway with your Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

supabaseGateway.initialize(supabase);

// 2. Example: Fetching data (SELECT)
async function fetchMessages() {
  // ❌ OLD WAY - Direct Supabase call (breaks offline)
  // const { data, error } = await supabase
  //   .from('messages')
  //   .select('*');

  // ✅ NEW WAY - Via gateway (offline resilient)
  const result = await supabaseGateway.from('messages', {
    order: { column: 'timestamp', ascending: false },
    limit: 20,
  });

  if (result.status === 'SUCCESS') {
    return result.data;
  } else if (result.status === 'QUEUED') {
    console.log('Query queued, will sync when online');
    return []; // Return empty or cached data
  } else {
    console.error('Failed:', result.error);
    return [];
  }
}

// 3. Example: Inserting data (INSERT)
async function createAlert(alertData: any) {
  // ✅ Via gateway - queues if offline or fails
  const result = await supabaseGateway.insert('alerts', {
    title: alertData.title,
    description: alertData.description,
    priority: 'high',
    timestamp: new Date().toISOString(),
  });

  if (result.status === 'SUCCESS') {
    console.log('Alert created:', result.data);
    return result.data;
  } else if (result.status === 'QUEUED') {
    console.log('Alert queued with ID:', result.outboxId);
    // Show "Queued for sync" UI
    return { queued: true, outboxId: result.outboxId };
  }
}

// 4. Example: Updating data (UPDATE)
async function updateMessageStatus(messageId: string, status: string) {
  const result = await supabaseGateway.update(
    'messages',
    { status, updated_at: new Date().toISOString() },
    { id: messageId }
  );

  if (result.status === 'SUCCESS') {
    console.log('Updated successfully');
  } else if (result.status === 'QUEUED') {
    console.log('Update queued for later sync');
  }
}

// 5. Example: Raw query execution
async function complexQuery() {
  const result = await supabaseGateway.execute({
    table: 'messages',
    operation: 'select',
    filters: { type: 'alert', status: 'active' },
    options: {
      order: { column: 'timestamp', ascending: false },
      limit: 10,
      single: false,
    },
  });

  return result;
}

// 6. React Hook Example
import { useState, useEffect } from 'react';

export function useSupabaseQuery(table: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    async function fetch() {
      const result = await supabaseGateway.from(table as any);
      
      if (result.status === 'SUCCESS') {
        setData(result.data || []);
        setQueued(false);
      } else if (result.status === 'QUEUED') {
        setQueued(true);
        // Could load from local Dexie cache here
      }
      
      setLoading(false);
    }

    fetch();
  }, [table]);

  return { data, loading, queued };
}

export { fetchMessages, createAlert, updateMessageStatus, complexQuery };
