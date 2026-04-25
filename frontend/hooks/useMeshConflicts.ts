/**
 * useMeshConflicts - React Hook for Conflict Management
 * Provides global conflict state for the ConflictResolver component
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { meshSync, ConflictRecord } from '@/lib/services/meshSync';

interface UseMeshConflictsReturn {
  // Current active conflicts
  activeConflicts: ConflictRecord[];
  currentConflict: ConflictRecord | null;
  
  // State
  hasConflicts: boolean;
  
  // Actions
  resolveConflict: (conflictId: string, resolution: 'LOCAL' | 'REMOTE') => Promise<boolean>;
  resolveCurrent: (resolution: 'LOCAL' | 'REMOTE') => Promise<boolean>;
  skipCurrent: () => void;
  dismissAll: () => Promise<void>;
}

export function useMeshConflicts(): UseMeshConflictsReturn {
  const [activeConflicts, setActiveConflicts] = useState<ConflictRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Subscribe to mesh sync conflicts
  useEffect(() => {
    const unsubscribe = meshSync.subscribe((conflict) => {
      setActiveConflicts(prev => {
        // Check if already exists
        if (prev.some(c => c.id === conflict.id)) {
          return prev;
        }
        return [...prev, conflict];
      });
    });

    // Load any existing conflicts
    const existing = meshSync.getPendingConflicts();
    setActiveConflicts(existing);

    return unsubscribe;
  }, []);

  // Get current conflict
  const currentConflict = activeConflicts[currentIndex] || null;
  const hasConflicts = activeConflicts.length > 0 && activeConflicts.some(c => !c.resolved);

  // Resolve specific conflict
  const resolveConflict = useCallback(async (
    conflictId: string, 
    resolution: 'LOCAL' | 'REMOTE'
  ): Promise<boolean> => {
    const success = await meshSync.resolveConflict(conflictId, resolution);
    
    if (success) {
      setActiveConflicts(prev => 
        prev.map(c => 
          c.id === conflictId 
            ? { ...c, resolved: true, resolution } 
            : c
        )
      );

      // Move to next conflict if this was current
      if (currentConflict?.id === conflictId) {
        setCurrentIndex(prev => Math.min(prev + 1, activeConflicts.length - 1));
      }
    }

    return success;
  }, [currentConflict, activeConflicts.length]);

  // Resolve current conflict
  const resolveCurrent = useCallback(async (
    resolution: 'LOCAL' | 'REMOTE'
  ): Promise<boolean> => {
    if (!currentConflict) return false;
    return resolveConflict(currentConflict.id, resolution);
  }, [currentConflict, resolveConflict]);

  // Skip current conflict (will auto-resolve later via LWW)
  const skipCurrent = useCallback(() => {
    setCurrentIndex(prev => Math.min(prev + 1, activeConflicts.length - 1));
  }, [activeConflicts.length]);

  // Dismiss all conflicts (auto-resolve all to REMOTE/LWW)
  const dismissAll = useCallback(async (): Promise<void> => {
    for (const conflict of activeConflicts) {
      if (!conflict.resolved) {
        await meshSync.resolveConflict(conflict.id, 'REMOTE');
      }
    }
    setActiveConflicts([]);
    setCurrentIndex(0);
  }, [activeConflicts]);

  // Clean up resolved conflicts from state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveConflicts(prev => {
        const filtered = prev.filter(c => !c.resolved);
        
        // Reset index if needed
        if (currentIndex >= filtered.length && filtered.length > 0) {
          setCurrentIndex(0);
        }
        
        return filtered;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  return {
    activeConflicts,
    currentConflict,
    hasConflicts,
    resolveConflict,
    resolveCurrent,
    skipCurrent,
    dismissAll,
  };
}

// Simplified hook for just checking if conflicts exist
export function useHasConflicts(): boolean {
  const [hasConflicts, setHasConflicts] = useState(false);

  useEffect(() => {
    const unsubscribe = meshSync.subscribe(() => {
      setHasConflicts(meshSync.hasActiveConflicts());
    });

    setHasConflicts(meshSync.hasActiveConflicts());

    return unsubscribe;
  }, []);

  return hasConflicts;
}

export default useMeshConflicts;
