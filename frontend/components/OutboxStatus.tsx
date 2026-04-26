'use client';

import { Database, RotateCw, AlertTriangle, WifiOff, Cloud, CloudOff } from 'lucide-react';
import { useOfflineFirst } from '@/hooks/useOfflineFirst';

export default function OutboxStatus() {
  const { status, forceSync, clearFailed, retryItem, outboxItems } = useOfflineFirst();

  // Don't show if nothing pending
  if (status.pendingCount === 0 && status.failedCount === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-slate-600" />
          </div>
          <span className="text-xs font-semibold text-slate-900 font-mono">Sync Queue</span>
        </div>
        <div className="flex items-center gap-3 font-mono">
          {/* Status indicators */}
          {!status.isOnline && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <CloudOff className="w-3 h-3" />
              Offline
            </span>
          )}
          {status.isProcessing && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <RotateCw className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          )}
          {status.pendingCount > 0 && (
            <span className="text-xs text-emerald-600 font-mono">
              {status.pendingCount} pending
            </span>
          )}
          {status.failedCount > 0 && (
            <span className="text-xs text-red-600 font-mono">
              {status.failedCount} failed
            </span>
          )}
        </div>
      </div>

      {/* Failed items warning - Light theme */}
      {status.failedCount > 0 && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-700 font-medium font-mono">
              {status.failedCount} items failed to sync
            </p>
            <div className="flex gap-3 mt-2">
              {status.canRetry && (
                <button
                  onClick={forceSync}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium font-mono"
                >
                  Retry All
                </button>
              )}
              <button
                onClick={clearFailed}
                className="text-xs text-slate-400 hover:text-slate-600 font-mono"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending items list (limited to 3) - Light theme */}
      {outboxItems.length > 0 && (
        <div className="space-y-2">
          {outboxItems.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-100"
            >
              <div className="flex items-center gap-3 font-mono">
                <span className="text-xs text-slate-600">
                  {item.status}
                </span>
                {item.retryCount > 0 && (
                  <span className="text-[10px] text-slate-400">
                    Retry {item.retryCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {item.status === 'failed' && (
                  <button
                    onClick={() => retryItem(item.id!)}
                    className="text-xs text-slate-600 hover:text-slate-900 font-medium font-mono"
                  >
                    Retry
                  </button>
                )}
                <div className={`w-2 h-2 rounded-full ${
                  item.status === 'pending' ? 'bg-emerald-500' :
                  item.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                  'bg-red-500'
                }`} />
              </div>
            </div>
          ))}
          {outboxItems.length > 3 && (
            <p className="text-xs text-slate-400 text-center py-2 font-mono">
              +{outboxItems.length - 3} more items
            </p>
          )}
        </div>
      )}

      {/* Last sync info */}
      {status.lastSyncAttempt && (
        <p className="text-[10px] text-slate-400 mt-3 text-right font-mono">
          Last attempt: {status.lastSyncAttempt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
