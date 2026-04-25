'use client';

import { useEffect } from 'react';
import { housekeeper } from '@/lib/services/housekeeper';

export default function HousekeeperInitializer() {
  useEffect(() => {
    // Start background housekeeping (auto-deletion)
    housekeeper.start();
    
    return () => {
      housekeeper.stop();
    }
  }, []);

  return null;
}
