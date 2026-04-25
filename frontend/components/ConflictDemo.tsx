/**
 * ConflictDemo - Testing/Development Component
 * Simulates conflicts to demonstrate the resolution system
 */

'use client';

import { useCallback } from 'react';
import { meshSync } from '@/lib/services/meshSync';
import { db } from '@/lib/db';

export default function ConflictDemo() {
  // Simulate a conflict scenario
  const simulateConflict = useCallback(async () => {
    console.log('404 FOUND: [DEMO] Simulating conflict scenario...');

    // First, create a local message
    const localId = await db.messages.add({
      type: 'news',
      title: 'Original Local Title',
      description: 'This is the local version of the message',
      timestamp: new Date(),
      synced: true,
      localId: `local-${Date.now()}`,
    });

    console.log('404 FOUND: [DEMO] Local message created:', localId);

    // Get the created message
    const localMsg = await db.messages.get(localId);

    if (!localMsg) {
      console.error('404 FOUND: [DEMO] Failed to create local message');
      return;
    }

    // Now simulate receiving a remote message with SAME timestamp but different content
    const remoteMsg = {
      id: localMsg.localId,
      type: 'news',
      title: 'Different Remote Title',
      description: 'This is the REMOTE version - content differs!',
      timestamp: localMsg.timestamp, // Same timestamp = conflict!
      source: 'mesh-node-2',
    };

    console.log('404 FOUND: [DEMO] Processing remote message...');
    
    // Process the incoming message
    const result = await meshSync.processIncomingMessage(remoteMsg);
    
    console.log('404 FOUND: [DEMO] Conflict result:', result);
  }, []);

  // Simulate LWW overwrite (remote newer)
  const simulateLWW = useCallback(async () => {
    console.log('404 FOUND: [DEMO] Simulating LWW (remote newer)...');

    // Create local message with OLD timestamp
    const oldDate = new Date(Date.now() - 60000); // 1 minute ago
    
    const localId = await db.messages.add({
      type: 'alert',
      title: 'Old Alert',
      description: 'This is outdated',
      timestamp: oldDate,
      synced: true,
      localId: `lww-local-${Date.now()}`,
    });

    const localMsg = await db.messages.get(localId);

    // Remote with NEWER timestamp
    const remoteMsg = {
      id: localMsg?.localId,
      type: 'alert',
      title: 'Updated Alert',
      description: 'This is the newer version',
      timestamp: new Date(), // Newer!
      source: 'mesh-node-2',
    };

    const result = await meshSync.processIncomingMessage(remoteMsg);
    console.log('404 FOUND: [DEMO] LWW result (should be UPDATED):', result);
  }, []);

  return (
    <div className="p-4 bg-[#151522] border border-[#2a2a3e] rounded-xl">
      <h3 className="text-sm font-bold text-[#e0e0e0] mb-3">Conflict Resolution Demo</h3>
      <div className="flex gap-3">
        <button
          onClick={simulateConflict}
          className="px-4 py-2 bg-[#ff0040]/10 hover:bg-[#ff0040]/20 border border-[#ff0040]/50 text-[#ff0040] font-mono text-xs rounded-lg transition-colors"
        >
          Simulate Conflict
        </button>
        <button
          onClick={simulateLWW}
          className="px-4 py-2 bg-[#9333ea]/10 hover:bg-[#9333ea]/20 border border-[#9333ea]/50 text-[#9333ea] font-mono text-xs rounded-lg transition-colors"
        >
          Simulate LWW
        </button>
      </div>
      <p className="text-[10px] text-[#6b6b7b] mt-3 font-mono">
        Check console for 404 FOUND logs and watch for conflict modal
      </p>
    </div>
  );
}
