/**
 * OfflineBanner - Tactical Terminal Aesthetic Offline Indicator
 * Fixed bottom banner showing offline status
 */

'use client';

import { WifiOff, AlertTriangle } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';

export default function OfflineBanner() {
  const { isOffline } = useOfflineStatus();
  const { pendingCount } = useSyncStatus();

  // Don't render if online
  if (!isOffline) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-[100] bg-amber-50 border-t border-amber-200"
      style={{ boxShadow: '0 -4px 20px rgba(245, 158, 11, 0.15)' }}
    >
      <div className="relative flex items-center justify-center gap-4 px-4 py-3 font-mono">
        {/* Warning Icon */}
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-600" />
          <AlertTriangle className="w-4 h-4 text-amber-600 animate-pulse" />
        </div>
        
        {/* Main Text - Professional Warning Style */}
        <p className="text-xs font-bold text-amber-800 tracking-wider uppercase">
          <span className="text-amber-400">[</span>
          SYSTEM: OFFLINE
          <span className="text-amber-400">]</span>
          <span className="mx-2 text-amber-300">|</span>
          <span className="text-amber-700">
            QUEUED ACTIONS WILL SYNC UPON RESTORATION
          </span>
        </p>
        
        {/* Pending Count Badge */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 ml-2 px-2 py-1 bg-amber-100 border border-amber-300 rounded-md">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-amber-700">
              {pendingCount} QUEUED
            </span>
          </div>
        )}
        
        {/* Status Dot */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-amber-600">
              MESH_DISCONNECTED
            </span>
          </div>
        </div>
      </div>
      
      {/* Bottom accent line */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-50" />
    </div>
  );
}
