'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Wifi, RefreshCw, CloudOff, Users, SignalHigh, SignalLow, Signal, Zap } from 'lucide-react';
import { useSimpleSyncStatus, useSyncStatus } from '@/hooks/useSyncStatus';

export default function Header() {
  const { state, label, color, isOnline } = useSimpleSyncStatus();
  const { pendingCount } = useSyncStatus();
  const { peerCount, isConnected, status: meshStatus } = useMesh();
  const hasConflicts = useHasConflicts();
  const [lastState, setLastState] = useState(state);

  // Connection Toast effect
  useEffect(() => {
    if (state !== lastState) {
      const isNowOnline = state === 'ONLINE' || state === 'SYNCING';
      const wasOnline = lastState === 'ONLINE' || lastState === 'SYNCING';
      
      if (isNowOnline && !wasOnline) {
        // Just connected
        window.dispatchEvent(new CustomEvent('mesh:toast', { 
          detail: { message: 'MESH LINK ESTABLISHED', type: 'success' } 
        }));
      } else if (!isNowOnline && wasOnline) {
        // Just disconnected
        window.dispatchEvent(new CustomEvent('mesh:toast', { 
          detail: { message: 'MESH LINK SEVERED', type: 'error' } 
        }));
      }
      setLastState(state);
    }
  }, [state, lastState]);

  // Light theme status configs
  const stateConfig: Record<string, { icon: any; bgColor: string; borderColor: string; dotColor: string }> = {
    'IDLE': {
      icon: Wifi,
      bgColor: 'bg-slate-100',
      borderColor: 'border-slate-200',
      dotColor: 'bg-slate-400',
    },
    'ONLINE': {
      icon: SignalHigh,
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/20',
      dotColor: 'bg-cyan-400',
      color: '#22d3ee',
    },
    'OFFLINE': {
      icon: SignalLow,
      bgColor: 'bg-slate-800/40',
      borderColor: 'border-slate-700',
      dotColor: 'bg-slate-500',
      color: '#94a3b8',
    },
    'SYNCING': {
      icon: RefreshCw,
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      dotColor: 'bg-amber-400',
      color: '#fbbf24',
    },
    'ERROR': {
      icon: AlertTriangle,
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      dotColor: 'bg-red-400',
      color: '#f87171',
    },
    'RECONNECTING': {
      icon: RefreshCw,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      dotColor: 'bg-amber-500',
    },
  };

  const config = stateConfig[state] || stateConfig.IDLE;
  const StatusIcon = config.icon;

  // High activity indicator (5+ peers)
  const highActivity = peerCount >= 5;

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        {/* Simplified Text-based Logo */}
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold font-mono tracking-tight text-white">
            VaultMesh
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Conflict Warning - Modern theme */}
          {hasConflicts && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg animate-pulse">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-400 tracking-wide uppercase">
                Conflict
              </span>
            </div>
          )}

          {/* SyncEngine Status Badge - Modern Dark theme */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-500 ${config.borderColor} ${config.bgColor} ${state === 'ONLINE' ? 'shadow-[0_0_20px_rgba(6,182,212,0.15)]' : ''}`}>
            <div className="relative flex items-center justify-center">
              <StatusIcon 
                className={`w-4 h-4 ${state === 'SYNCING' ? 'animate-spin' : ''}`}
                style={{ color: config.color || color }}
              />
              {state === 'ONLINE' && (
                <span className="absolute w-full h-full bg-cyan-400 rounded-full animate-ping opacity-20" />
              )}
            </div>
            
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Network
              </span>
              <span className="text-xs font-semibold" style={{ color: config.color || color }}>
                {label}
              </span>
            </div>
            
            {/* Peers count with modern styling */}
            <div className="h-4 w-px bg-slate-700 mx-1" />
            
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className={`text-xs font-medium ${
                highActivity 
                  ? 'text-cyan-400' 
                  : 'text-slate-300'
              }`}>
                {peerCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
