// Stub mesh sync for frontend UI rendering

export interface ConflictRecord {
  id: string;
  resolved: boolean;
  resolution?: 'LOCAL' | 'REMOTE';
}

export const meshSync = {
  subscribe(callback: (conflict: ConflictRecord) => void) {
    return () => {};
  },
  getPendingConflicts(): ConflictRecord[] {
    return [];
  },
  hasActiveConflicts(): boolean {
    return false;
  },
  async resolveConflict(conflictId: string, resolution: 'LOCAL' | 'REMOTE'): Promise<boolean> {
    return true;
  }
};
