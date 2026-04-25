'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Shield, 
  MapPin, 
  Users, 
  Activity,
  Zap,
  Lock,
  Globe,
  Bluetooth,
  Layers
} from 'lucide-react';
import { transportManager } from '@/lib/services/transportManager';
import { gossipEngine } from '@/lib/services/gossipEngine';
import { geospatialService } from '@/lib/services/geospatial';
import { routerService } from '@/lib/services/router';
import { identityService } from '@/lib/services/identity';
import { useToast } from '@/hooks/useToast';
import ToastContainer from './ToastContainer';

interface PeerInfo {
  id: string;
  name: string;
  transport: string;
  status: 'connected' | 'discovered' | 'disconnected';
  lastSeen: number;
  rssi?: number;
}

export default function MeshNetwork() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [syncStats, setSyncStats] = useState(gossipEngine.getSyncStats());
  const [lamportClock, setLamportClock] = useState(0);
  const [activeTransport, setActiveTransport] = useState<'ble' | 'webrtc' | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; long: number } | null>(null);
  const [routerK, setRouterK] = useState(routerService.getK());
  const [routerTTL, setRouterTTL] = useState(routerService.getDefaultTTL());
  const { toasts, showToast, dismissToast } = useToast();

  // Load identity and location on mount
  useEffect(() => {
    const loadData = async () => {
      if (!identityService.isInitialized) {
        await identityService.initialize();
      }
      setPublicKey(identityService.exportPublicKey());
      setLamportClock(gossipEngine.getLamportClock());
      setActiveTransport(transportManager.getActiveAdapter()?.constructor.name.includes('Bluetooth') ? 'ble' : 'webrtc');
    };
    loadData();
  }, []);

  // Auto-refresh sync stats
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncStats(gossipEngine.getSyncStats());
      setLamportClock(gossipEngine.getLamportClock());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartDiscovery = useCallback(async () => {
    setIsDiscovering(true);
    showToast('Starting peer discovery...', 'info');
    
    try {
      transportManager.onPeerDiscovered((peer: any) => {
        setPeers(prev => {
          const exists = prev.find(p => p.id === peer.id);
          if (exists) {
            return prev.map(p => p.id === peer.id ? { ...p, lastSeen: Date.now(), status: 'discovered' as const } : p);
          }
          return [...prev, { 
            id: peer.id, 
            name: peer.name || `Peer ${peer.id.slice(-6)}`, 
            transport: peer.transport || 'unknown',
            status: 'discovered',
            lastSeen: Date.now(),
            rssi: peer.rssi
          }];
        });
      });
      
      await transportManager.startDiscovery();
      showToast('Discovery started', 'success');
    } catch (error: any) {
      showToast(`Discovery failed: ${error.message}`, 'error');
    }
  }, [showToast]);

  const handleStopDiscovery = useCallback(async () => {
    await transportManager.stopDiscovery();
    setIsDiscovering(false);
    showToast('Discovery stopped', 'info');
  }, [showToast]);

  const handleSimulateSync = useCallback(async () => {
    showToast('Simulating sync handshake...', 'info');
    // Simulate a peer sync for demo
    const fakePeer = { id: `peer-${Date.now().toString(36)}`, summary: [] };
    await gossipEngine.onPeerConnect(fakePeer);
    setSyncStats(gossipEngine.getSyncStats());
    showToast('Sync simulation complete', 'success');
  }, [showToast]);

  const handleGetLocation = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          geospatialService.setCurrentLocation(latitude, longitude);
          setLocation({ lat: latitude, long: longitude });
          showToast(`Location set: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
        },
        (err) => showToast(`Location error: ${err.message}`, 'error')
      );
    } else {
      showToast('Geolocation not available', 'error');
    }
  }, [showToast]);

  const handleRotateKeys = useCallback(async () => {
    showToast('Rotating identity keys...', 'info');
    await identityService.rotateKeys();
    setPublicKey(identityService.exportPublicKey());
    showToast('Keys rotated successfully', 'success');
  }, [showToast]);

  const handleUpdateRouterConfig = useCallback(() => {
    routerService.setK(routerK);
    routerService.setDefaultTTL(routerTTL);
    showToast(`Router config updated: k=${routerK}, TTL=${routerTTL}`, 'success');
  }, [routerK, routerTTL, showToast]);

  const formatLastSeen = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const truncateKey = (key: string | null) => {
    if (!key) return 'Not available';
    return `${key.slice(0, 16)}...${key.slice(-8)}`;
  };

  return (
    <div className="py-6 space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Identity Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Ephemeral Identity
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="space-y-2">
            <p className="text-slate-500">Public Key</p>
            <p className="text-slate-900 font-mono bg-slate-100 px-3 py-2 rounded-lg break-all">
              {truncateKey(publicKey)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-slate-500">Lamport Clock</p>
            <p className="text-slate-900 font-mono bg-slate-100 px-3 py-2 rounded-lg">
              {lamportClock}
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleRotateKeys}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium font-mono transition-colors"
          >
            <RefreshCw className="w-3 h-3 inline mr-2" />
            Rotate Keys (24h)
          </button>
          <button
            onClick={handleGetLocation}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium font-mono transition-colors"
          >
            <MapPin className="w-3 h-3 inline mr-2" />
            Set Location
          </button>
        </div>
        {location && (
          <p className="mt-2 text-[10px] text-slate-500 font-mono">
            Location: {location.lat.toFixed(6)}, {location.long.toFixed(6)}
          </p>
        )}
      </div>

      {/* Transport & Discovery */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Radio className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Transport & Discovery
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Active Adapter</p>
            <p className="text-sm font-bold text-slate-900 font-mono mt-1">
              {activeTransport === 'ble' ? (
                <span className="flex items-center justify-center gap-1">
                  <Bluetooth className="w-4 h-4 text-blue-500" /> BLE
                </span>
              ) : activeTransport === 'webrtc' ? (
                <span className="flex items-center justify-center gap-1">
                  <Globe className="w-4 h-4 text-emerald-500" /> WebRTC
                </span>
              ) : 'None'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Peers</p>
            <p className="text-sm font-bold text-slate-900 font-mono mt-1">
              {peers.filter(p => p.status !== 'disconnected').length}
            </p>
          </div>
          <div classClassName="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Discovering</p>
            <p className="text-sm font-bold text-slate-900 font-mono mt-1">
              {isDiscovering ? (
                <span className="text-emerald-600 flex items-center justify-center gap-1">
                  <Activity className="w-4 h-4 animate-pulse" /> Yes
                </span>
              ) : (
                <span className="text-slate-400">No</span>
              )}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Grid Cell</p>
            <p className="text-sm font-bold text-slate-900 font-mono mt-1">
              {location ? 'Set' : 'None'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={isDiscovering ? handleStopDiscovery : handleStartDiscovery}
            className={`px-4 py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
              isDiscovering
                ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
          >
            {isDiscovering ? (
              <><WifiOff className="w-3 h-3 inline mr-2" /> Stop Discovery</>
            ) : (
              <><Wifi className="w-3 h-3 inline mr-2" /> Start Discovery</>
            )}
          </button>
          <button
            onClick={handleSimulateSync}
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium font-mono transition-colors"
          >
            <RefreshCw className="w-3 h-3 inline mr-2" />
            Simulate Sync
          </button>
        </div>
      </div>

      {/* Gossip Engine Stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Layers className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Gossip Engine
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Total Syncs</p>
            <p className="text-lg font-bold text-slate-900 font-mono">{syncStats.totalSyncs}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Hashes Exchanged</p>
            <p className="text-lg font-bold text-slate-900 font-mono">{syncStats.hashesExchanged}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Messages Tx</p>
            <p className="text-lg font-bold text-slate-900 font-mono">{syncStats.messagesTransferred}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-500 font-mono uppercase">Last Sync</p>
            <p className="text-sm font-bold text-slate-900 font-mono">
              {syncStats.lastSyncAt ? formatLastSeen(syncStats.lastSyncAt) : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* Router Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Random Walk Router
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <label className="text-slate-500">Subset Size (k):</label>
            <input
              type="number"
              min={1}
              max={10}
              value={routerK}
              onChange={(e) => setRouterK(Number(e.target.value))}
              className="w-16 px-2 py-1 bg-slate-100 rounded border border-slate-200 text-slate-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500">TTL (hops):</label>
            <input
              type="number"
              min={1}
              max={50}
              value={routerTTL}
              onChange={(e) => setRouterTTL(Number(e.target.value))}
              className="w-16 px-2 py-1 bg-slate-100 rounded border border-slate-200 text-slate-900"
            />
          </div>
          <button
            onClick={handleUpdateRouterConfig}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Peers List */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Discovered Peers
          </h2>
          <span className="ml-auto text-[10px] text-slate-500 font-mono">
            {peers.length} total
          </span>
        </div>
        
        {peers.length === 0 ? (
          <p className="text-sm text-slate-400 font-mono text-center py-8">
            No peers discovered. Start discovery to find nearby nodes.
          </p>
        ) : (
          <div className="space-y-2">
            {peers.map(peer => (
              <div 
                key={peer.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    peer.status === 'connected' ? 'bg-emerald-500' : 
                    peer.status === 'discovered' ? 'bg-amber-500' : 'bg-slate-400'
                  }`} />
                  <div>
                    <p className="text-xs font-bold text-slate-900 font-mono">{peer.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {peer.transport.toUpperCase()} • {formatLastSeen(peer.lastSeen)}
                      {peer.rssi && ` • RSSI ${peer.rssi}dBm`}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-slate-400">
                  {peer.id.slice(0, 12)}...
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Note */}
      <div className="bg-slate-900 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Lock className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider">
            Mesh Security
          </h2>
        </div>
        <ul className="space-y-2 text-[11px] font-mono text-slate-300">
          <li>• Ed25519 signatures on all messages</li>
          <li>• Ephemeral keys rotate every 24 hours</li>
          <li>• AES-GCM session encryption</li>
          <li>• SHA-256 content addressing (idempotent)</li>
          <li>• Shamir Secret Sharing for sensitive data</li>
          <li>• Haversine geofencing (no exact location broadcast)</li>
          <li>• Grid Cell ID privacy (1km resolution)</li>
          <li>• Bloom Filter anti-entropy sync</li>
          <li>• Propagation history loop prevention</li>
        </ul>
      </div>
    </div>
  );
}
