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
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Ephemeral Identity
          </h2>
        </div>
        <div className="space-y-3 text-xs font-mono">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Status</span>
            <span className={`font-bold ${isInitialized ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isInitialized ? 'Initialized' : 'Pending'}
            </span>
          </div>
          <div className="py-2 border-b border-slate-100">
            <span className="text-slate-500 block mb-1">Public Key (Ed25519)</span>
            <code className="block bg-slate-100 px-3 py-2 rounded-lg text-slate-900 break-all">
              {truncate(publicKey)}
            </code>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Key Rotation</span>
            <span className="text-slate-900">Every 24 hours</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-slate-500">Private Key Storage</span>
            <span className="text-emerald-600 font-bold">In-memory only</span>
          </div>
        </div>
        <button
          onClick={handleRotateKeys}
          className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium font-mono transition-colors"
        >
          <RefreshCw className="w-3 h-3 inline mr-2" />
          Rotate Keys Now
        </button>
      </section>

      {/* Transport */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Radio className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Transport Layer
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => handleSetTransport('ble')}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
              activeTransport === 'BluetoothLEAdapter'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bluetooth className="w-5 h-5" />
            <div className="text-left">
              <p className="text-xs font-bold font-mono">Bluetooth LE</p>
              <p className="text-[10px] text-slate-500 font-mono">Mobile native</p>
            </div>
          </button>
          <button
            onClick={() => handleSetTransport('webrtc')}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
              activeTransport === 'WebRTCAdapter'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Globe className="w-5 h-5" />
            <div className="text-left">
              <p className="text-xs font-bold font-mono">WebRTC</p>
              <p className="text-[10px] text-slate-500 font-mono">Browser tab-to-tab</p>
            </div>
          </button>
        </div>
      </section>

      {/* Geospatial */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Geospatial Filtering
          </h2>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-500">Current Location</span>
            <span className="text-slate-900">
              {location ? `${location.lat.toFixed(4)}, ${location.long.toFixed(4)}` : 'Not set'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 font-mono">Grid Cell Size (degrees):</label>
            <input
              type="number"
              step={0.001}
              value={gridCellSize}
              onChange={(e) => setGridCellSize(Number(e.target.value))}
              className="w-24 px-2 py-1 bg-slate-100 rounded border border-slate-200 text-xs font-mono"
            />
            <button
              onClick={handleSetGridCellSize}
              className="px-3 py-1 bg-slate-900 text-white rounded text-[10px] font-mono"
            >
              Apply
            </button>
          </div>
          <button
            onClick={handleGetLocation}
            className="w-full px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium font-mono transition-colors"
          >
            <MapPin className="w-3 h-3 inline mr-2" />
            Update Location from GPS
          </button>
        </div>
      </section>

      {/* Router Config */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <SettingsIcon className="w-5 h-5 text-slate-700" />
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
              className="w-16 px-2 py-1 bg-slate-100 rounded border border-slate-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500">Default TTL:</label>
            <input
              type="number"
              min={1}
              max={50}
              value={routerTTL}
              onChange={(e) => setRouterTTL(Number(e.target.value))}
              className="w-16 px-2 py-1 bg-slate-100 rounded border border-slate-200"
            />
          </div>
          <button
            onClick={handleUpdateRouterConfig}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      </section>

      {/* Data Management */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-slate-700" />
          <h2 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wider">
            Local Data
          </h2>
        </div>
        <div className="flex justify-between items-center text-xs font-mono mb-4">
          <span className="text-slate-500">Stored Messages</span>
          <span className="text-slate-900 font-bold">{messageCount}</span>
        </div>
        <button
          onClick={handleClearMessages}
          className="w-full px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-medium font-mono transition-colors"
        >
          <Trash2 className="w-3 h-3 inline mr-2" />
          Clear All Messages
        </button>
      </section>

      {/* Security */}
      <section className="bg-red-50 border border-red-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-red-600" />
          <h2 className="text-sm font-bold font-mono text-red-700 uppercase tracking-wider">
            Security
          </h2>
        </div>
        <p className="text-xs text-red-600 font-mono mb-4">
          Emergency wipe deletes all local data, keys, and session state. 
          Use the shield button (bottom-right) with long-press to activate.
        </p>
        <div className="flex items-center gap-2 text-xs text-red-600 font-mono">
          <AlertTriangle className="w-4 h-4" />
          <span>Long-press the shield icon for 3 seconds to trigger wipe</span>
        </div>
      </section>
    </div>
  );
}
