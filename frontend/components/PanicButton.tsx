'use client';

import React, { useState, useRef, useEffect } from 'react';
import { securityService } from '@/lib/services/securityService';
import { cryptoService } from '@/lib/services/crypto';
import { Button } from '@/components/ui/button';
import { ShieldAlert, TriangleAlert, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PanicButton - Secure Global Wipe Trigger
 * Requires a "Long Press" (3 seconds) to prevent accidental wipes.
 * Visual prompt "Wipe System?" flashes before execution.
 */
export default function PanicButton() {
  const [isPressing, setIsWipeActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const timerRef = useRef(null);

  const startPanic = () => {
    setIsWipeActive(true);
    setProgress(0);
    
    // Non-obvious trigger: Must hold for 3 seconds
    const duration = 3000;
    const interval = 50;
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      elapsed += interval;
      const newProgress = (elapsed / duration) * 100;
      
      if (newProgress >= 100) {
        clearInterval(timerRef.current);
        setShowPrompt(true);
        // Execute wipe after brief delay for visual prompt
        setTimeout(() => {
          executeWipe();
        }, 500);
      } else {
        setProgress(newProgress);
      }
    }, interval);
  };

  const cancelPanic = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsWipeActive(false);
    setProgress(0);
    setShowPrompt(false);
  };

  const executeWipe = async () => {
    toast.error('Emergency Wipe Initiated...', { duration: 5000 });
    await securityService.emergencyWipe();
  };

  return (
    <div className="fixed bottom-24 right-6 z-[100] group flex flex-col gap-2 items-end">
      {/* Session Reset Button - Key Rotation Only */}
      <Button
        onClick={async () => {
          await cryptoService.resetSession();
          toast.success('Session Reset: Keys rotated', { duration: 3000 });
        }}
        className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-900/80 border border-slate-800 hover:bg-slate-800 transition-all duration-300"
        title="Session Reset: Rotate Keys"
      >
        <RotateCcw className="w-5 h-5 text-slate-400 hover:text-blue-400" />
      </Button>

      {/* Panic Button - Full Data Wipe */}
      <div className="relative flex items-center justify-center">
        {/* Progress Ring */}
        {isPressing && (
          <svg className="absolute w-20 h-20 -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              className="text-red-900/20"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={226.2}
              strokeDashoffset={226.2 - (226.2 * progress) / 100}
              className="text-red-600 transition-all duration-75"
            />
          </svg>
        )}

        {/* Visual Prompt "Wipe System?" */}
        {showPrompt && (
          <div className="absolute -top-16 right-0 px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg animate-pulse">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-bold font-mono uppercase">Wipe System?</span>
            </div>
          </div>
        )}

        <Button
          onMouseDown={startPanic}
          onMouseUp={cancelPanic}
          onMouseLeave={cancelPanic}
          onTouchStart={startPanic}
          onTouchEnd={cancelPanic}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
            isPressing 
              ? 'bg-red-600 scale-110 shadow-[0_0_20px_rgba(220,38,38,0.5)]' 
              : 'bg-slate-900/80 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          {isPressing ? (
            <TriangleAlert className="w-6 h-6 text-white animate-pulse" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-slate-400 group-hover:text-red-500" />
          )}
        </Button>
      </div>
      
      {/* Tooltip hint */}
      {!isPressing && (
        <span className="absolute right-16 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[9px] text-slate-500 font-mono opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          SECURE_WIPE (HOLD)
        </span>
      )}
    </div>
  );
}
