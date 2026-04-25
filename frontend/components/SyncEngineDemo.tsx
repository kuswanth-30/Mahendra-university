/**
 * SyncEngineDemo - Example Component
 * Demonstrates how to use the SyncEngine with optimistic UI
 */

'use client';

import { useState } from 'react';
import { useSyncStatus, useSyncActions } from '@/hooks/useSyncStatus';

export default function SyncEngineDemo() {
  const { 
    state, 
    isOnline, 
    isSyncing, 
    pendingCount, 
    failedCount, 
    errors,
    forceSync,
    clearFailed 
  } = useSyncStatus();
  
  const { queueAction } = useSyncActions();
  const [lastAction, setLastAction] = useState<string>('');

  const handlePostMessage = async () => {
    const result = await queueAction('POST_MESSAGE', {
      title: 'Test Message',
      description: 'This is an optimistic UI test',
      priority: 'normal'
    });

    setLastAction(`Queued message (ID: ${result.outboxId})`);
  };

  const handleBroadcastAlert = async () => {
    const result = await queueAction('BROADCAST_ALERT', {
      title: 'EMERGENCY ALERT',
      message: 'This is a test alert',
      severity: 'high'
    }, { priority: 'high' });

    setLastAction(`Queued alert (ID: ${result.outboxId})`);
  };

  const handleScanQR = async () => {
    const result = await queueAction('SCAN_QR', {
      data: 'https://404found.local/data/12345',
      location: 'Main Gate',
      timestamp: new Date().toISOString()
    });

    setLastAction(`Queued QR scan (ID: ${result.outboxId})`);
  };

  return (
    <div className="p-6 bg-[#151522] border border-[#2a2a3e] rounded-xl space-y-4">
      <h2 className="text-lg font-bold text-[#e0e0e0]">SyncEngine Demo</h2>

      {/* Status Display */}
      <div className="p-4 bg-[#0D0D19] rounded-lg">
        <p className="text-sm text-[#6b6b7b]">State: <span className="text-[#9333ea]">{state}</span></p>
        <p className="text-sm text-[#6b6b7b]">Online: <span className={isOnline ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{isOnline ? 'Yes' : 'No'}</span></p>
        <p className="text-sm text-[#6b6b7b]">Syncing: <span className={isSyncing ? 'text-[#9333ea]' : 'text-[#6b6b7b]'}>{isSyncing ? 'Yes' : 'No'}</span></p>
        <p className="text-sm text-[#6b6b7b]">Pending: <span className="text-[#e0e0e0]">{pendingCount}</span></p>
        <p className="text-sm text-[#6b6b7b]">Failed: <span className={failedCount > 0 ? 'text-[#ef4444]' : 'text-[#e0e0e0]'}>{failedCount}</span></p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePostMessage}
          className="px-4 py-2 bg-[#9333ea] hover:bg-[#a855f7] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Queue Message
        </button>
        <button
          onClick={handleBroadcastAlert}
          className="px-4 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Queue Alert
        </button>
        <button
          onClick={handleScanQR}
          className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Queue QR Scan
        </button>
      </div>

      {/* Management Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={forceSync}
          disabled={!isOnline || isSyncing}
          className="px-4 py-2 bg-[#2a2a3e] hover:bg-[#3a3a4e] text-[#e0e0e0] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          Force Sync
        </button>
        <button
          onClick={clearFailed}
          disabled={failedCount === 0}
          className="px-4 py-2 bg-[#2a2a3e] hover:bg-[#3a3a4e] text-[#ef4444] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          Clear Failed
        </button>
      </div>

      {/* Last Action */}
      {lastAction && (
        <p className="text-sm text-[#22c55e]">{lastAction}</p>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-3 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg">
          <p className="text-xs text-[#ef4444] font-medium mb-2">Errors:</p>
          {errors.map((error, i) => (
            <p key={i} className="text-xs text-[#ef4444]">{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
