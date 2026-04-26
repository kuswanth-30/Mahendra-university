'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  RotateCw, 
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
    <div className="py-6 space-y-8">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Identity Card */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <Shield className="w-6 h-6 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-wider group-hover:text-[#00ff41] transition-colors">
            Ephemeral Identity
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Public Key</p>
            <p className="text-base font-bold text-slate-100 font-mono bg-black/30 px-4 py-3 rounded-lg break-all border border-white/5">
              {truncateKey(publicKey)}
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Lamport Clock</p>
            <p className="text-base font-bold text-slate-100 font-mono bg-black/30 px-4 py-3 rounded-lg border border-white/5">
              {lamportClock}
            </p>
          </div>
        </div>
        <div className="flex gap-4 mt-8">
          <button
            onClick={handleRotateKeys}
            className="px-6 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,255,65,0.3)] hover:scale-[1.02] cursor-pointer flex items-center gap-2"
          >
            <RotateCw className="w-3 h-3" />
            ROTATE_KEYS (24H)
          </button>
          <button
            onClick={handleGetLocation}
            className="px-6 py-2 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,255,65,0.2)] flex items-center gap-2"
          >
            <MapPin className="w-3 h-3" />
            SET_LOCATION
          </button>
        </div>
        {location && (
          <p className="mt-4 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            COORDINATES: {location.lat.toFixed(6)}, {location.long.toFixed(6)}
          </p>
        )}
      </section>

      {/* Transport & Discovery */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <Radio className="w-6 h-6 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-wider group-hover:text-[#00ff41] transition-colors">
            Transport & Discovery
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 mb-8">
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Active Adapter</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">
              {activeTransport === 'ble' ? (
                <span className="flex items-center justify-center gap-2">
                  <Bluetooth className="w-4 h-4 text-blue-400" /> BLE
                </span>
              ) : activeTransport === 'webrtc' ? (
                <span className="flex items-center justify-center gap-2">
                  <Globe className="w-4 h-4 text-[#00ff41]" /> WebRTC
                </span>
              ) : 'NONE'}
            </p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Peers</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">
              {peers.filter(p => p.status !== 'disconnected').length}
            </p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Discovering</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">
              {isDiscovering ? (
                <span className="text-[#00ff41] flex items-center justify-center gap-2 animate-pulse">
                  <Activity className="w-4 h-4" /> YES
                </span>
              ) : (
                <span className="text-slate-500">NO</span>
              )}
            </p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Grid Cell</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">
              {location ? 'SET' : 'NONE'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={isDiscovering ? handleStopDiscovery : handleStartDiscovery}
            className={`px-6 py-2 rounded-lg text-xs font-bold font-mono transition-all duration-300 cursor-pointer flex items-center gap-2 ${
              isDiscovering
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                : 'bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 hover:shadow-[0_0_15px_rgba(0,255,65,0.2)]'
            }`}
          >
            {isDiscovering ? (
              <><WifiOff className="w-3 h-3" /> STOP_DISCOVERY</>
            ) : (
              <><Wifi className="w-3 h-3" /> START_DISCOVERY</>
            )}
          </button>
          <button
            onClick={handleSimulateSync}
            className="px-6 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] cursor-pointer flex items-center gap-2"
          >
            <RotateCw className="w-3 h-3" />
            SIMULATE_SYNC
          </button>
        </div>
      </section>

      {/* Gossip Engine Stats */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <Layers className="w-6 h-6 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-wider group-hover:text-[#00ff41] transition-colors">
            Gossip Engine
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Total Syncs</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">{syncStats.totalSyncs}</p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Hashes Exchanged</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">{syncStats.hashesExchanged}</p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Messages Tx</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">{syncStats.messagesTransferred}</p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 text-center transition-all duration-300 hover:shadow-md hover:scale-[1.02] hover:bg-white/5 cursor-pointer">
            <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Last Sync</p>
            <p className="text-base font-bold text-slate-100 font-mono mt-3">
              {syncStats.lastSyncAt ? formatLastSeen(syncStats.lastSyncAt) : 'NEVER'}
            </p>
          </div>
        </div>
      </section>

      {/* Router Config */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <Zap className="w-6 h-6 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-wider group-hover:text-[#00ff41] transition-colors">
            Random Walk Router
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-8 mt-6">
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-slate-500 tracking-widest uppercase">Subset Size (k):</label>
            <input
              type="number"
              min={1}
              max={10}
              value={routerK}
              onChange={(e) => setRouterK(Number(e.target.value))}
              className="w-20 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-base font-bold text-slate-100 font-mono outline-none focus:border-[#00ff41]/50"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-slate-500 tracking-widest uppercase">TTL (hops):</label>
            <input
              type="number"
              min={1}
              max={50}
              value={routerTTL}
              onChange={(e) => setRouterTTL(Number(e.target.value))}
              className="w-20 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-base font-bold text-slate-100 font-mono outline-none focus:border-[#00ff41]/50"
            />
          </div>
          <button
            onClick={handleUpdateRouterConfig}
            className="px-6 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,255,65,0.3)] uppercase"
          >
            Apply
          </button>
        </div>
      </section>

      {/* Discovered Peers */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <Users className="w-6 h-6 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-wider group-hover:text-[#00ff41] transition-colors">
            Discovered Peers
          </h2>
          <span className="ml-auto text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest bg-black/30 px-2 py-1 rounded border border-white/5">
            {peers.length} NODES_ACTIVE
          </span>
        </div>
        
        <div className="mt-8">
          {peers.length === 0 ? (
            <p className="text-sm text-slate-500 font-mono text-center py-12 uppercase tracking-widest bg-black/20 rounded-lg border border-dashed border-white/5">
              No peers discovered. Start discovery to find nearby nodes.
            </p>
          ) : (
            <div className="space-y-4">
              {peers.map(peer => (
                <div 
                  key={peer.id}
                  className="flex items-center justify-between p-4 bg-black/30 border border-white/5 rounded-lg transition-all duration-300 hover:shadow-md hover:scale-[1.01] hover:bg-white/5 cursor-pointer group/peer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
                      peer.status === 'connected' ? 'bg-[#00ff41] shadow-[#00ff41]/50' : 
                      peer.status === 'discovered' ? 'bg-amber-500 shadow-amber-500/50' : 'bg-slate-600'
                    }`} />
                    <div>
                      <p className="text-sm font-bold text-slate-100 font-mono uppercase">{peer.name}</p>
                      <p className="text-[10px] font-semibold text-slate-500 font-mono uppercase tracking-tight">
                        {peer.transport} // {formatLastSeen(peer.lastSeen)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 group-hover/peer:text-slate-400 transition-colors">
                    ID: {peer.id.slice(0, 16)}...
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Mesh Security Protocol */}
      <section className="bg-[#00ff41]/5 border border-[#00ff41]/10 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-[#00ff41]/20 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#00ff41]/10">
          <Lock className="w-6 h-6 text-[#00ff41] group-hover:text-emerald-400 transition-colors" />
          <h2 className="text-xl md:text-2xl font-black text-[#00ff41] uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
            Mesh Security protocol
          </h2>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-[11px] font-bold font-mono text-slate-400 uppercase tracking-tight mt-6">
          <li className="flex items-center gap-2 text-emerald-500/80"><Shield className="w-3 h-3" /> Ed25519 signatures active</li>
          <li className="flex items-center gap-2"><div className="w-1 h-1 bg-slate-600 rounded-full" /> Ephemeral keys rotate 24h</li>
          <li className="flex items-center gap-2"><div className="w-1 h-1 bg-slate-600 rounded-full" /> AES-GCM session encryption</li>
          <li className="flex items-center gap-2"><div className="w-1 h-1 bg-slate-600 rounded-full" /> SHA-256 content addressing</li>
          <li className="flex items-center gap-2"><div className="w-1 h-1 bg-slate-600 rounded-full" /> Shamir Secret Sharing</li>
          <li className="flex items-center gap-2"><div className="w-1 h-1 bg-slate-600 rounded-full" /> Haversine geofencing</li>
        </ul>
      </section>
    </div>
  );
}
