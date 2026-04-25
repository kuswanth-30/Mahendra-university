'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Newspaper, MessageSquare, QrCode, MapPin, Search, PlusCircle, WifiOff, RefreshCw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '@/lib/db';
import ContentCard from './ContentCard';
import { meshNode } from '@/lib/services/meshNode.js';

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
  const [isScanningPeers, setIsScanningPeers] = useState(false);
  
  // REACTIVE DATABASE QUERY
  // Automatically re-runs when any message is added/updated in Dexie
  const dbMessages = useLiveQuery(
    () => db.messages.orderBy('timestamp').reverse().toArray(),
    []
  );

  const isLoading = dbMessages === undefined;

  // Map database messages to FeedItem format
  const mappedDbMessages = useMemo(() => {
    if (!dbMessages) return [];
    
    return dbMessages.map(msg => {
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
        title: 'Encrypted Message', // Placeholder, ContentCard handles decryption
        description: '[Verifying Integrity...]',
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
  }, [dbMessages]);

  const feedData = useMemo(() => {
    if (tab === 'local') return mappedDbMessages;
    if (tab === 'qr') return qrDropsData;
    if (tab === 'direct') return directMessagesData;
    return [];
  }, [tab, mappedDbMessages]);

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
            <div className="space-y-2 pt-2">
              <div className="h-4 bg-gray-900 rounded w-full" />
              <div className="h-4 bg-gray-900 rounded w-5/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="py-6">
      {sortedData.length === 0 ? (
        <div className="max-w-xl mx-auto py-20 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-lg bg-black border border-gray-800 mb-8 shadow-lg shadow-terminal-green/5">
            <WifiOff className="w-10 h-10 text-gray-800" />
          </div>
          <h3 className="text-2xl font-bold text-terminal-green mb-3 tracking-tight">VAULT_EMPTY</h3>
          <p className="text-gray-500 mb-10 leading-relaxed max-w-sm mx-auto font-mono text-sm uppercase">
            {tab === 'local' 
              ? 'Local vault awaiting propagation. Connect to mesh nodes.' 
              : 'No activity detected for current protocol filter.'}
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <button 
              onClick={() => {
                setIsScanningPeers(true);
                meshNode.initialize();
                setTimeout(() => setIsScanningPeers(false), 3000);
              }}
              disabled={isScanningPeers}
              className="group flex flex-col items-center justify-center gap-3 p-6 bg-transparent border border-gray-800 rounded-lg hover:border-terminal-green hover:shadow-[0_0_10px_rgba(0,255,65,0.1)] transition-all text-sm font-bold text-slate-200"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${isScanningPeers ? 'text-terminal-green' : 'text-gray-700 group-hover:text-terminal-green'}`}>
                {isScanningPeers ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
              </div>
              <div className="text-center">
                <span className="block text-[10px] text-gray-600 font-bold mb-1 uppercase tracking-[0.2em]">Discovery</span>
                <span className="text-xs font-bold uppercase tracking-widest">{isScanningPeers ? 'Scanning...' : 'Find_Nodes'}</span>
              </div>
            </button>

            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mesh:open-alert-modal'));
              }}
              className="group flex flex-col items-center justify-center gap-3 p-6 bg-transparent border border-gray-800 rounded-lg hover:border-terminal-green hover:shadow-[0_0_10px_rgba(0,255,65,0.1)] transition-all text-sm font-bold text-slate-200"
            >
              <div className="w-12 h-12 text-gray-700 group-hover:text-terminal-green rounded-lg flex items-center justify-center transition-all">
                <PlusCircle className="w-6 h-6" />
              </div>
              <div className="text-center">
                <span className="block text-[10px] text-gray-600 font-bold mb-1 uppercase tracking-[0.2em]">Protocol</span>
                <span className="text-xs font-bold uppercase tracking-widest">New_Broadcast</span>
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
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            Mesh Persistence: {dbMessages.length} entries cached
          </span>
          <span className="text-[10px] font-mono text-emerald-600 uppercase">
            Reactive Link Active
          </span>
        </div>
      )}
    </div>
  );
}
