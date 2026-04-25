/**
 * ConflictIndicator - Small indicator for active conflicts
 * Shows in header or status bar when conflicts exist
 */

'use client';

import { AlertTriangle } from 'lucide-react';
import { useMeshConflicts } from '@/hooks/useMeshConflicts';

interface ConflictIndicatorProps {
  onClick?: () => void;
}

export default function ConflictIndicator({ onClick }: ConflictIndicatorProps) {
  const { hasConflicts, activeConflicts } = useMeshConflicts();

  if (!hasConflicts) return null;

  const unresolvedCount = activeConflicts.filter(c => !c.resolved).length;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-[#ff0040]/10 border border-[#ff0040]/30 text-[#ff0040] hover:bg-[#ff0040]/20 transition-colors"
      style={{ borderRadius: '2px' }}
    >
      <AlertTriangle className="w-4 h-4" />
      <span className="text-xs font-bold font-mono tracking-wider">
        {unresolvedCount} CONFLICT{unresolvedCount !== 1 ? 'S' : ''}
      </span>
    </button>
  );
}
