'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Wifi, RefreshCw, CloudOff, Users, SignalHigh, SignalLow, Signal, Zap, Sun, Moon, Database } from 'lucide-react';
import { useSimpleSyncStatus, useSyncStatus } from '@/hooks/useSyncStatus';
import { useMesh } from '@/hooks/useMesh';
import { useHasConflicts } from '@/hooks/useMeshConflicts';
import { useTheme } from '@/contexts/ThemeContext';
import { useMockData } from '@/contexts/MockDataContext';

export default function Header() {
  const { state, label, color, isOnline } = useSimpleSyncStatus();
  const { pendingCount } = useSyncStatus();
  const { peerCount, isConnected, status: meshStatus } = useMesh();
  const hasConflicts = useHasConflicts();
  const { theme, toggleTheme } = useTheme();
  const { useMockData: isMockData, toggleMockData } = useMockData();
  const [lastState, setLastState] = useState(state);
  const [latency, setLatency] = useState(42);
  const [uptime, setUptime] = useState(0);

  // Latency simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(prev => Math.max(12, Math.min(150, prev + (Math.random() * 20 - 10))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Uptime counter
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

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

  // Theme-aware status configs
  const stateConfig: Record<string, { icon: any; bgColor: string; borderColor: string; dotColor: string; color: string }> = {
    'IDLE': {
      icon: Wifi,
      bgColor: theme === 'dark' ? 'bg-slate-900/50' : 'bg-white',
      borderColor: theme === 'dark' ? 'border-slate-700' : 'border-slate-300',
      dotColor: theme === 'dark' ? 'bg-slate-400' : 'bg-slate-900',
      color: theme === 'dark' ? '#94a3b8' : '#0f172a',
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
      bgColor: theme === 'dark' ? 'bg-slate-800/40' : 'bg-slate-100',
      borderColor: theme === 'dark' ? 'border-slate-700' : 'border-slate-300',
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
      bgColor: theme === 'dark' ? 'bg-amber-900/20' : 'bg-amber-50',
      borderColor: theme === 'dark' ? 'border-amber-700' : 'border-amber-200',
      dotColor: 'bg-amber-500',
      color: '#f59e0b',
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
          <span className="text-xl font-bold font-mono tracking-tight" style={{ color: 'var(--foreground)' }}>
            PROJECT RMSK
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Mock Data Toggle Button */}
          <button
            onClick={toggleMockData}
            className="flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-300 hover:shadow-md"
            style={{ 
              backgroundColor: isMockData ? 'var(--primary)' : 'var(--card)', 
              borderColor: 'var(--border)' 
            }}
            aria-label="Toggle mock data"
            title={isMockData ? 'Mock Data: ON' : 'Mock Data: OFF'}
          >
            <Database className="w-5 h-5" style={{ color: isMockData ? 'var(--primary-foreground)' : 'var(--foreground)' }} strokeWidth={2.5} />
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-300 hover:shadow-md"
            style={{ 
              backgroundColor: 'var(--card)', 
              borderColor: 'var(--border)' 
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" style={{ color: 'var(--foreground)' }} strokeWidth={2.5} />
            ) : (
              <Moon className="w-5 h-5" style={{ color: 'var(--foreground)' }} strokeWidth={2.5} />
            )}
          </button>

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
          <div className={`group relative flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-500 cursor-pointer ${config.borderColor} ${config.bgColor} ${state === 'ONLINE' ? 'shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.25)]' : ''}`}>
            <div className="relative flex items-center justify-center">
              <StatusIcon 
                className={`w-4 h-4 ${state === 'SYNCING' ? 'animate-spin' : ''} ${state === 'ONLINE' || state === 'SYNCING' ? 'animate-pulse' : ''}`}
                style={{ color: config.color || color }}
              />
              {state === 'ONLINE' && (
                <span className="absolute w-full h-full bg-cyan-400 rounded-full animate-ping opacity-20" />
              )}
            </div>
            
            <div className="flex flex-col leading-none min-w-[80px]">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>
                PROTOCOL
              </span>
              <span className="text-sm font-black font-mono uppercase" style={{ color: config.color || color }}>
                {label}
              </span>
            </div>

            {/* Metrics */}
            <div className="hidden md:flex items-center gap-3">
              <div className="h-5 w-px" style={{ backgroundColor: 'var(--border)' }} />
              <div className="flex flex-col leading-none">
                <span className="text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: 'var(--muted-foreground)' }}>LATENCY</span>
                <span className="text-xs font-black font-mono" style={{ color: 'var(--foreground)' }}>{latency.toFixed(0)}MS</span>
              </div>
            </div>
            
            <div className="h-5 w-px mx-1" style={{ backgroundColor: 'var(--border)' }} />
            
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: 'var(--foreground)' }} strokeWidth={3} />
              <span className={`text-sm font-black font-mono ${
                highActivity 
                  ? 'text-[#00ff41]' 
                  : ''
              }`} style={{ color: highActivity ? undefined : 'var(--foreground)' }}>
                {peerCount.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Tooltip/Dropdown */}
            <div className="absolute top-full right-0 mt-2 w-48 rounded-xl p-4 shadow-2xl invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-xl z-[60]" style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2" style={{ borderBottomColor: 'var(--border)', borderBottomWidth: '1px' }}>
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--muted-foreground)' }}>Mode</span>
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--popover-foreground)' }}>P2P_CLIENT</span>
                </div>
                <div className="flex justify-between items-center pb-2" style={{ borderBottomColor: 'var(--border)', borderBottomWidth: '1px' }}>
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--muted-foreground)' }}>Transport</span>
                  <span className="text-xs font-bold font-mono uppercase text-[#00ff41]">WebRTC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--muted-foreground)' }}>Uptime</span>
                  <span className="text-xs font-bold font-mono uppercase" style={{ color: 'var(--popover-foreground)' }}>{formatUptime(uptime)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
