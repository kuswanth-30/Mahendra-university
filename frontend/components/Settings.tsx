'use client';

import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Key, 
  Radio, 
  MapPin, 
  Trash2, 
  RefreshCw,
  AlertTriangle,
  Globe,
  Bluetooth,
  Database,
  Shield
} from 'lucide-react';
import { identityService } from '@/lib/services/identity';
import { transportManager } from '@/lib/services/transportManager';
import { geospatialService } from '@/lib/services/geospatial';
import { db } from '@/lib/db';
import { useToast } from '@/hooks/useToast';
import ToastContainer from './ToastContainer';
import { routerService } from '@/lib/services/router';

export default function Settings() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTransport, setActiveTransport] = useState<string>('webrtc');
  const [location, setLocation] = useState<{ lat: number; long: number } | null>(null);
  const [gridCellSize, setGridCellSize] = useState(geospatialService.getGridCellSize());
  const [messageCount, setMessageCount] = useState(0);
  const [routerK, setRouterK] = useState(routerService.getK());
  const [routerTTL, setRouterTTL] = useState(routerService.getDefaultTTL());
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    const load = async () => {
      if (!identityService.isInitialized) {
        await identityService.initialize();
      }
      setPublicKey(identityService.exportPublicKey());
      setIsInitialized(true);
      
      const adapter = transportManager.getActiveAdapter();
      setActiveTransport(adapter?.constructor.name || 'none');
      
      const count = await db.messages.count();
      setMessageCount(count);
    };
    load();
  }, []);

  const handleRotateKeys = async () => {
    showToast('Rotating identity keys...', 'info');
    await identityService.rotateKeys();
    setPublicKey(identityService.exportPublicKey());
    showToast('Keys rotated successfully. New identity active.', 'success');
  };

  const handleSetTransport = (type: 'ble' | 'webrtc') => {
    transportManager.setActiveAdapter(type);
    setActiveTransport(type);
    showToast(`Transport switched to ${type.toUpperCase()}`, 'success');
  };

  const handleGetLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          geospatialService.setCurrentLocation(latitude, longitude);
          setLocation({ lat: latitude, long: longitude });
          showToast(`Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
        },
        (err) => showToast(err.message, 'error')
      );
    }
  };

  const handleSetGridCellSize = () => {
    geospatialService.setGridCellSize(gridCellSize);
    showToast(`Grid cell size set to ${gridCellSize} degrees`, 'success');
  };

  const handleUpdateRouterConfig = () => {
    routerService.setK(routerK);
    routerService.setDefaultTTL(routerTTL);
    showToast(`Router: k=${routerK}, TTL=${routerTTL}`, 'success');
  };

  const handleClearMessages = async () => {
    if (confirm('Delete all local messages? This cannot be undone.')) {
      await db.messages.clear();
      setMessageCount(0);
      showToast('All messages cleared', 'info');
    }
  };

  const handleEmergencyWipe = async () => {
    showToast('Emergency wipe initiated...', 'error');
    // User should use the PanicButton for actual wipe
  };

  const truncate = (str: string | null, len = 24) => {
    if (!str) return 'Not available';
    return str.length > len ? `${str.slice(0, len)}...` : str;
  };

  return (
    <div className="py-6 space-y-6 max-w-4xl mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Identity */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6">
          <Key className="w-5 h-5 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-300 transition-colors">
            Ephemeral Identity
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 items-center py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Status</span>
            <span className={`text-base font-bold font-mono ${isInitialized ? 'text-[#00ff41]' : 'text-amber-500'}`}>
              {isInitialized ? 'INITIALIZED' : 'PENDING'}
            </span>
          </div>
          <div className="py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase block mb-2">Public Key (Ed25519)</span>
            <code className="block bg-black/30 px-4 py-3 rounded-lg text-base font-bold text-slate-100 font-mono break-all border border-white/5">
              {truncate(publicKey, 32)}
            </code>
          </div>
          <div className="grid grid-cols-2 items-center py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Key Rotation</span>
            <span className="text-base font-bold text-slate-100 font-mono uppercase">Every 24 hours</span>
          </div>
          <div className="grid grid-cols-2 items-center py-3">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Private Key Storage</span>
            <span className="text-[#00ff41] text-base font-bold font-mono uppercase">In-memory only</span>
          </div>
        </div>
        <button
          onClick={handleRotateKeys}
          className="mt-6 px-6 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,255,65,0.3)] hover:scale-[1.02] cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="w-3 h-3" />
          ROTATE_KEYS_NOW
        </button>
      </section>

      {/* Transport */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6">
          <Radio className="w-5 h-5 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-300 transition-colors">
            Transport Layer
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleSetTransport('ble')}
            className={`flex items-center gap-3 p-5 rounded-xl border transition-all duration-300 cursor-pointer ${
              activeTransport === 'BluetoothLEAdapter'
                ? 'bg-[#00ff41]/10 border-[#00ff41]/30 text-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.1)]'
                : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Bluetooth className="w-5 h-5" />
            <div className="text-left">
              <p className="text-sm font-bold font-mono uppercase">Bluetooth LE</p>
              <p className="text-[10px] opacity-60 font-mono uppercase">Mobile native</p>
            </div>
          </button>
          <button
            onClick={() => handleSetTransport('webrtc')}
            className={`flex items-center gap-3 p-5 rounded-xl border transition-all duration-300 cursor-pointer ${
              activeTransport === 'WebRTCAdapter'
                ? 'bg-[#00ff41]/10 border-[#00ff41]/30 text-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.1)]'
                : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Globe className="w-5 h-5" />
            <div className="text-left">
              <p className="text-sm font-bold font-mono uppercase">WebRTC</p>
              <p className="text-[10px] opacity-60 font-mono uppercase">Browser tab-to-tab</p>
            </div>
          </button>
        </div>
      </section>

      {/* Geospatial */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-5 h-5 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-300 transition-colors">
            Geospatial Filtering
          </h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 items-center py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Current Location</span>
            <span className="text-base font-bold text-slate-100 font-mono uppercase">
              {location ? `${location.lat.toFixed(4)}, ${location.long.toFixed(4)}` : 'NOT_SET'}
            </span>
          </div>
          <div className="flex items-center gap-4 py-2">
            <label className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Grid Cell Size:</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                step={0.001}
                value={gridCellSize}
                onChange={(e) => setGridCellSize(Number(e.target.value))}
                className="flex-1 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-base font-bold text-slate-100 font-mono outline-none focus:border-[#00ff41]/50"
              />
              <button
                onClick={handleSetGridCellSize}
                className="px-4 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-lg text-[10px] font-bold font-mono transition-all duration-300 uppercase"
              >
                Apply
              </button>
            </div>
          </div>
          <button
            onClick={handleGetLocation}
            className="w-full px-6 py-3 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,255,65,0.2)] flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            UPDATE_LOCATION_FROM_GPS
          </button>
        </div>
      </section>

      {/* Router Config */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-5 h-5 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-300 transition-colors">
            Random Walk Router
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Subset Size (k):</label>
            <input
              type="number"
              min={1}
              max={10}
              value={routerK}
              onChange={(e) => setRouterK(Number(e.target.value))}
              className="w-20 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-base font-bold text-slate-100 font-mono outline-none focus:border-[#00ff41]/50"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Default TTL:</label>
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

      {/* Data Management */}
      <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-white/10 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-5 h-5 text-slate-400 group-hover:text-[#00ff41] transition-colors" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-300 transition-colors">
            Local Data
          </h2>
        </div>
        <div className="grid grid-cols-2 items-center py-3 border-b border-white/5 mb-6">
          <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Stored Messages</span>
          <span className="text-base font-bold text-slate-100 font-mono">{messageCount}</span>
        </div>
        <button
          onClick={handleClearMessages}
          className="w-full px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold font-mono transition-all duration-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] flex items-center justify-center gap-2 uppercase"
        >
          <Trash2 className="w-4 h-4" />
          Clear All Messages
        </button>
      </section>

      {/* Security */}
      <section className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-red-500/40 hover:scale-[1.01] cursor-pointer group">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-red-500 group-hover:text-red-400 transition-colors" />
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide group-hover:text-red-400 transition-colors">
            Security Protocol
          </h2>
        </div>
        <p className="text-xs font-mono text-red-400/80 mb-6 leading-relaxed uppercase tracking-tight">
          Emergency wipe deletes all local data, keys, and session state. 
          Use the shield button (bottom-right) with long-press to activate.
        </p>
        <div className="flex items-center gap-3 text-[10px] font-bold font-mono text-red-500 uppercase tracking-widest bg-red-500/10 p-3 rounded-lg border border-red-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span>Long-press shield icon for 3s to trigger wipe</span>
        </div>
      </section>
    </div>
  );
}
