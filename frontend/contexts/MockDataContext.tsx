'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface MockDataContextType {
  useMockData: boolean;
  toggleMockData: () => void;
}

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [useMockData, setUseMockData] = useState(true);

  const toggleMockData = () => {
    setUseMockData(prev => !prev);
  };

  return (
    <MockDataContext.Provider value={{ useMockData, toggleMockData }}>
      {children}
    </MockDataContext.Provider>
  );
}

export function useMockData() {
  const context = useContext(MockDataContext);
  if (context === undefined) {
    throw new Error('useMockData must be used within a MockDataProvider');
  }
  return context;
}
