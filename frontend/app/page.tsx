'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import NavigationTabs from '@/components/NavigationTabs';
import ContentFeed from '@/components/ContentFeed';
import FloatingActionButton from '@/components/FloatingActionButton';
import OutboxStatus from '@/components/OutboxStatus';
import ConflictResolver from '@/components/ConflictResolver';
import QRManager from '@/components/QRManager';
import MeshNetwork from '@/components/MeshNetwork';
import Settings from '@/components/Settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState('local');

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-gray font-mono selection:bg-cyber-green/30 selection:text-cyber-green">
      <div className="min-h-screen">
        <Header />
        <NavigationTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="mt-4 mb-6">
            {/* Outbox Sync Status */}
            <OutboxStatus />
          </div>
          
          <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-gray-800 p-1 min-h-[60vh] transition-all shadow-[0_0_20px_rgba(0,0,0,0.4)]">
            <div className="p-4 sm:p-6">
              {activeTab === 'qr' ? (
                <QRManager />
              ) : activeTab === 'mesh' ? (
                <MeshNetwork />
              ) : activeTab === 'settings' ? (
                <Settings />
              ) : (
                <ContentFeed tab={activeTab} />
              )}
            </div>
          </div>
        </main>
        <FloatingActionButton />
        
        {/* Conflict Resolution Modal - Rendered at root level */}
        <ConflictResolver />
      </div>
    </div>
  );
}
