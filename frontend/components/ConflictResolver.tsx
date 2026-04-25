/**
 * ConflictResolver - Terminal Aesthetic Conflict Resolution Modal
 * Side-by-side comparison of Local vs Remote versions
 */

'use client';

import { X, AlertTriangle, Clock, FileText, Check } from 'lucide-react';
import { useMeshConflicts } from '@/hooks/useMeshConflicts';

export default function ConflictResolver() {
  const { 
    currentConflict, 
    hasConflicts, 
    resolveCurrent, 
    skipCurrent,
    activeConflicts 
  } = useMeshConflicts();

  // Don't render if no conflicts
  if (!hasConflicts || !currentConflict) {
    return null;
  }

  const { localRecord, remoteRecord } = currentConflict;
  const conflictNumber = activeConflicts.findIndex((c: any) => c.id === currentConflict.id) + 1;
  const totalConflicts = activeConflicts.length;

  const handleKeepMine = async () => {
    await resolveCurrent('LOCAL');
  };

  const handleApplyRemote = async () => {
    await resolveCurrent('REMOTE');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      {/* Modal Container - Professional Light */}
      <div 
        className="w-full max-w-4xl bg-white border border-slate-200 shadow-2xl overflow-hidden rounded-xl"
      >
        {/* Header - Light Theme */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-wider font-mono">
                SYNC_CONFLICT_DETECTED
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase">
                Conflict {conflictNumber} of {totalConflicts}
              </p>
            </div>
          </div>
          
          {/* Close / Skip Button */}
          <button
            onClick={skipCurrent}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg transition-colors"
          >
            <span className="text-xs font-bold font-mono">SKIP</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - Side by Side */}
        <div className="p-6">
          <p className="text-xs text-slate-500 font-mono mb-6 bg-slate-50 p-3 rounded-lg border border-slate-100">
            [SYSTEM]: Content mismatch detected. Choose which version to prioritize for synchronization.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LOCAL VERSION */}
            <div className="border border-emerald-100 bg-emerald-50/30 rounded-xl overflow-hidden transition-all hover:shadow-md">
              {/* Local Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-bold text-emerald-700 font-mono tracking-wider">
                    LOCAL_VERSION
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 font-mono">
                  [CURRENT]
                </span>
              </div>

              {/* Local Content */}
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Type
                  </label>
                  <p className="text-sm text-slate-700 font-mono mt-1 font-bold">
                    {localRecord.type?.toUpperCase() || 'UNKNOWN'}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Title
                  </label>
                  <p className="text-sm text-slate-900 font-mono mt-1 leading-relaxed font-bold">
                    {localRecord.title}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Description
                  </label>
                  <p className="text-sm text-slate-600 font-mono mt-1 leading-relaxed line-clamp-4">
                    {localRecord.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-emerald-100">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-600 font-mono font-medium">
                    {new Date(localRecord.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Keep Mine Button */}
              <div className="p-4 bg-emerald-50/50 border-t border-emerald-100">
                <button
                  onClick={handleKeepMine}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-mono text-xs tracking-widest transition-all rounded-lg shadow-sm"
                >
                  KEEP LOCAL
                </button>
              </div>
            </div>

            {/* REMOTE VERSION */}
            <div className="border border-blue-100 bg-blue-50/30 rounded-xl overflow-hidden transition-all hover:shadow-md">
              {/* Remote Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-blue-700 font-mono tracking-wider">
                    REMOTE_VERSION
                  </span>
                </div>
                <span className="text-[10px] font-bold text-blue-600 font-mono">
                  [INCOMING]
                </span>
              </div>

              {/* Remote Content */}
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Type
                  </label>
                  <p className="text-sm text-slate-700 font-mono mt-1 font-bold">
                    {(remoteRecord.type || 'UNKNOWN').toUpperCase()}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Title
                  </label>
                  <p className="text-sm text-slate-900 font-mono mt-1 leading-relaxed font-bold">
                    {remoteRecord.title}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">
                    Description
                  </label>
                  <p className="text-sm text-slate-600 font-mono mt-1 leading-relaxed line-clamp-4">
                    {remoteRecord.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-blue-100">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-blue-600 font-mono font-medium">
                    {new Date(remoteRecord.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Apply Remote Button */}
              <div className="p-4 bg-blue-50/50 border-t border-blue-100">
                <button
                  onClick={handleApplyRemote}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold font-mono text-xs tracking-widest transition-all rounded-lg shadow-sm"
                >
                  APPLY REMOTE
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Info */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded font-mono">URGENT</div>
              <p className="text-[10px] text-slate-500 font-mono font-medium">
                Auto-resolves to LWW in 30 seconds if ignored
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">
                {activeConflicts.filter((c: any) => !c.resolved).length} Pending Conflicts
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
