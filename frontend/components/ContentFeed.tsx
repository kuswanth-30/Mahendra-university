'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Newspaper, 
  AlertTriangle, 
  MessageSquare, 
  Clock, 
  User,
  Shield,
  Search,
  WifiOff,
  Filter,
  QrCode,
  MapPin,
  PlusCircle,
  RefreshCw
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '@/lib/db';
import ClientOnly from './ClientOnly';
import { useMesh } from '@/hooks/useMesh';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { MOCK_FEED_DATA } from '@/lib/mockData';
import { meshNode } from '@/lib/services/meshNode.js';
import ContentCard from './ContentCard';
import { useMockData } from '@/contexts/MockDataContext';

interface FeedItem {
  id: string;
  icon: any;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  ciphertext?: string;
  iv?: string;
  lat?: number;
  long?: number;
  radius?: number;
  is_fragmented?: boolean;
  total_shards?: number;
  threshold?: number;
  shard_id?: number;
}

// Fallback static data for QR and Direct tabs (not stored in DB)
const qrDropsData: FeedItem[] = [
  {
    id: 'qr1',
    icon: QrCode,
    type: 'QR Drop',
    title: 'Resource Hotspot - Downtown',
    description: 'Location: 5th & Main. Medical supplies cache. Scan for inventory details.',
    timestamp: '30 minutes ago',
  },
  {
    id: 'qr2',
    icon: QrCode,
    type: 'QR Drop',
    title: 'Message Board - Civic Center',
    description: 'Location: Civic Center Plaza. Community messages and missing person alerts.',
    timestamp: '1 hour ago',
  },
];

const directMessagesData: FeedItem[] = [
  {
    id: 'dm1',
    icon: MessageSquare,
    type: 'Message',
    title: 'Alex: Check the north route update',
    description: 'Did you see the safe route notification? I&apos;m heading that way now.',
    timestamp: '5 minutes ago',
  },
  {
    id: 'dm2',
    icon: MessageSquare,
    type: 'Message',
    title: 'Sarah: Thanks for shelter info',
    description: 'Got my family to the extended hours center. Much appreciated for the broadcast.',
    timestamp: '20 minutes ago',
  },
];

interface ContentFeedProps {
  tab: string;
}

// Format timestamp to relative time
function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default function ContentFeed({ tab }: ContentFeedProps) {
  const { useMockData: isMockData } = useMockData();
  const [isScanningPeers, setIsScanningPeers] = useState(false);
  const dbMessages = useLiveQuery(
    () => db.messages.orderBy('timestamp').reverse().toArray(),
    []
  );

  const { isOnline: isSystemOnline } = useOfflineStatus();
  const { status: meshStatus, error: meshError } = useMesh();
  
  // 3-STATE LOGIC
  const isLoading = !isMockData && dbMessages === undefined;
  const hasError = !isMockData && meshStatus === 'error';
  const rawData = isMockData ? MOCK_FEED_DATA : (dbMessages || []);
  const isEmpty = rawData.length === 0;

  // Map messages to FeedItem format
  const mappedMessages = useMemo(() => {
    return rawData.map(msg => {
      const type = msg.type || 'News';
      const iconMap: Record<string, any> = {
        'Alert': AlertTriangle,
        'News': Newspaper,
        'Route': MapPin,
        'Message': MessageSquare,
        'QR Drop': QrCode,
      };

      return {
        id: msg.id,
        icon: iconMap[type] || Newspaper,
        type: type,
        title: isMockData ? msg.title : 'Encrypted Message',
        description: isMockData ? msg.content : '[Verifying Integrity...]',
        timestamp: formatTimestamp(msg.timestamp),
        ciphertext: msg.ciphertext,
        iv: msg.iv,
        lat: msg.lat,
        long: msg.long,
        radius: msg.radius,
        is_fragmented: msg.is_fragmented,
        total_shards: msg.total_shards,
        threshold: msg.threshold,
        shard_id: msg.shard_id,
      };
    });
  }, [rawData, isMockData]);

  const feedData = useMemo(() => {
    if (tab === 'local') return mappedMessages;
    if (tab === 'qr') return qrDropsData;
    if (tab === 'direct') return directMessagesData;
    return [];
  }, [tab, mappedMessages]);

  // Priority sort: Alert (1) > News (2) > Route (3) > Other (4)
  const priorityMap: Record<string, number> = {
    'Alert': 1,
    'News': 2,
    'Route': 3,
    'Message': 4,
    'QR Drop': 5,
  };

  const sortedData = useMemo(() => {
    return [...feedData].sort((a, b) => {
      const priorityA = priorityMap[a.type] || 4;
      const priorityB = priorityMap[b.type] || 4;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return 0; // Already sorted by timestamp in the query
    });
  }, [feedData]);

  if (!isSystemOnline && tab === 'local' && (!dbMessages || dbMessages.length === 0)) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-lg bg-black border border-amber-900/30 mb-8 shadow-lg shadow-amber-500/5">
          <WifiOff className="w-10 h-10 text-amber-500" />
        </div>
        <h3 className="text-3xl font-black text-amber-500 mb-4 tracking-tight uppercase">System_Offline</h3>
        <p className="text-slate-600 mb-10 leading-relaxed font-mono text-base font-bold uppercase">
          Browser connectivity lost. Mesh protocol suspended until network restoration.
        </p>
      </div>
    );
  }


  if (isLoading && tab === 'local') {
    return (
      <div className="py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-black border border-gray-900 rounded-lg p-6 space-y-4 animate-shimmer overflow-hidden">
            <div className="flex gap-5">
              <div className="w-12 h-12 bg-gray-900 rounded-lg" />
              <div className="flex-1 space-y-3">
                <div className="h-3 bg-gray-900 rounded w-1/4" />
                <div className="h-6 bg-gray-900 rounded w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ClientOnly>
      <div className="py-6">
        {!isMockData && tab === 'local' && (
          <div className="mb-6 flex justify-end">
            <button 
              onClick={async () => {
                setIsScanningPeers(true);
                await meshNode.scanForPeers();
                setTimeout(() => setIsScanningPeers(false), 3000);
              }}
              disabled={isScanningPeers}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/50 text-cyan-400 font-black uppercase tracking-widest hover:from-cyan-500/20 hover:to-blue-500/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:scale-[1.02] hover:border-cyan-400 transition-all duration-300 rounded-lg cursor-pointer relative overflow-hidden group text-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              {isScanningPeers ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isScanningPeers ? 'Scanning...' : 'Find_Nodes'}
            </button>
          </div>
        )}
        
        {sortedData.length === 0 ? (
          <div className="max-w-xl mx-auto py-20 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-lg bg-black border border-gray-800 mb-8 shadow-lg shadow-terminal-green/5">
              <WifiOff className="w-10 h-10 text-gray-800" />
            </div>
            <h3 className="text-3xl font-black text-terminal-green mb-4 tracking-tight">VAULT_EMPTY</h3>
            <p className="text-slate-600 mb-10 leading-relaxed max-w-sm mx-auto font-mono text-base font-bold uppercase">
              {tab === 'local' 
                ? 'Local vault awaiting propagation. Connect to mesh nodes.' 
                : 'No activity detected for current protocol filter.'}
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <button 
                onClick={async () => {
                  const { seedTestData } = await import('@/lib/seed');
                  seedTestData();
                }}
                className="group flex flex-col items-center justify-center gap-3 p-7 bg-gradient-to-br from-gray-900/50 to-black border border-gray-800 rounded-lg hover:border-terminal-green hover:shadow-[0_0_30px_rgba(0,255,65,0.3)] hover:scale-[1.05] hover:from-terminal-green/10 hover:to-black transition-all duration-300 text-base font-black text-slate-200 cursor-pointer relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-terminal-green/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <div className="w-12 h-12 text-gray-700 group-hover:text-terminal-green group-hover:bg-terminal-green/5 rounded-lg flex items-center justify-center transition-all relative z-10">
                  <PlusCircle className="w-6 h-6 group-hover:scale-110 group-hover:rotate-90 transition-transform duration-300" />
                </div>
                <div className="text-center">
                  <span className="block text-xs text-slate-700 font-black mb-1 uppercase tracking-[0.25em]">Protocol</span>
                  <span className="text-sm font-black uppercase tracking-widest">New_Broadcast</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full animate-in fade-in duration-700">
            {sortedData.map((item) => (
              <div key={item.id} className="w-full h-full">
                <ContentCard
                  icon={item.icon}
                  type={item.type}
                  title={item.title}
                  description={item.description}
                  timestamp={item.timestamp}
                  cardType={item.type === 'Alert' ? 'alert' : item.type === 'News' ? 'news' : item.type === 'Route' ? 'route' : 'default'}
                  id={item.id}
                  ciphertext={item.ciphertext}
                  iv={item.iv}
                  lat={item.lat}
                  long={item.long}
                  radius={item.radius}
                  is_fragmented={item.is_fragmented}
                  total_shards={item.total_shards}
                  threshold={item.threshold}
                  shard_id={item.shard_id}
                />
              </div>
            ))}
          </div>
        )}
        
        {/* Dev Stats */}
        {process.env.NODE_ENV === 'development' && tab === 'local' && dbMessages && (
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-600 font-bold uppercase tracking-widest">
              Mesh Persistence: {dbMessages.length} entries cached
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono text-emerald-700 font-bold uppercase">
                Reactive Link Active
              </span>
            </div>
          </div>
        )}
      </div>
    </ClientOnly>
  );
}
