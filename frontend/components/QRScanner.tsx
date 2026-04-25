'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine, X, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { databaseStore } from '@/lib/services/DatabaseStore';
import { toast } from 'sonner';

interface QRScannerProps {
  onScan?: (data: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner-container';

  useEffect(() => {
    // Get available cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          setSelectedCamera(devices[0].id);
        } else {
          setError('No cameras found');
        }
      })
      .catch((err) => {
        setError('Camera access denied or not available');
        console.error('Camera error:', err);
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanning = async () => {
    if (!selectedCamera) return;

    try {
      setIsScanning(true);
      setError('');

      scannerRef.current = new Html5Qrcode(scannerContainerId);

      await scannerRef.current.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // QR Code detected - process ingestion pipeline
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Scan error (this fires frequently when no QR is in view - ignore)
          console.log('Scan error:', errorMessage);
        }
      );
    } catch (err) {
      setError('Failed to start scanner');
      setIsScanning(false);
      console.error('Start error:', err);
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    try {
      // Stop scanning immediately
      await stopScanning();

      // 1. Parse JSON
      let payload;
      try {
        payload = JSON.parse(decodedText);
      } catch (err) {
        setError('Invalid JSON format');
        toast.error('Invalid QR Code: Not valid JSON');
        return;
      }

      // 2. Validate JSON schema (must have id, timestamp, content)
      if (!payload.id || !payload.timestamp || !payload.content) {
        setError('Invalid schema: missing required fields');
        toast.error('Invalid QR Code: Missing required fields (id, timestamp, content)');
        return;
      }

      // 3. Check timestamp (reject if older than 72 hours)
      const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
      const messageAge = Date.now() - payload.timestamp;
      
      if (messageAge > SEVENTY_TWO_HOURS_MS) {
        setError('Message expired (older than 72 hours)');
        toast.error('Expired QR Code: Message is older than 72 hours');
        return;
      }

      // 4. Integrate with DatabaseStore.upsertMessage()
      const result = await databaseStore.upsertMessage({
        id: payload.id,
        content: payload.content,
        timestamp: payload.timestamp,
        version: payload.version,
        type: payload.type,
        authorId: payload.authorId,
        signature: payload.signature,
        is_propagated: false,
        source: 'qr_drop',
        vectorClock: payload.vectorClock,
        ttl: payload.ttl,
        metadata: payload.metadata
      });

      if (result.success) {
        // 5. Toast notification on successful ingestion
        toast.success('QR Code ingested successfully', {
          description: `Message ${result.action}: ${payload.id.slice(0, 8)}...`
        });

        // Call optional onScan callback
        if (onScan) {
          onScan(decodedText);
        }
      } else {
        setError('Failed to store message');
        toast.error('Failed to store message in database');
      }

    } catch (err) {
      setError('Processing failed');
      console.error('Scan processing error:', err);
      toast.error('Failed to process QR Code');
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Stop error:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleClose = async () => {
    await stopScanning();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 w-full max-w-md relative shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
              <ScanLine className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 tracking-widest font-mono">QR_SCANNER</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="p-6">
          {/* Camera View */}
          <div className="relative aspect-square bg-slate-900 border border-slate-200 overflow-hidden rounded-xl shadow-inner">
            <div id={scannerContainerId} className="w-full h-full" />
            
            {/* Scan Overlay - Corner Brackets */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-emerald-400/80 rounded-tl-lg" />
              <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-emerald-400/80 rounded-tr-lg" />
              <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-emerald-400/80 rounded-bl-lg" />
              <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-emerald-400/80 rounded-br-lg" />
              
              {/* Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="w-56 h-56 border border-emerald-400/20 rounded-lg" />
                  <div className="absolute top-1/2 left-0 w-full h-px bg-emerald-400/30" />
                  <div className="absolute left-1/2 top-0 w-px h-full bg-emerald-400/30" />
                </div>
              </div>
            </div>

            {/* Scanning Status */}
            {isScanning && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-full shadow-lg animate-bounce">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest font-mono uppercase">Scanning...</span>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-red-600 font-mono">{error}</span>
            </div>
          )}

          {/* Controls */}
          <div className="mt-6 space-y-4">
            {/* Camera Select */}
            {!isScanning && cameras.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Select Camera</label>
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <Camera className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="flex-1 bg-transparent text-slate-700 text-xs font-bold font-mono focus:outline-none appearance-none cursor-pointer"
                  >
                    {cameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Camera ${cam.id.slice(0, 8)}...`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!isScanning ? (
                <button
                  onClick={startScanning}
                  disabled={!selectedCamera || cameras.length === 0}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono tracking-widest transition-all rounded-xl shadow-lg shadow-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                >
                  Start Scanner
                </button>
              ) : (
                <button
                  onClick={stopScanning}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold font-mono tracking-widest transition-all rounded-xl shadow-lg shadow-red-100 uppercase"
                >
                  Stop Scanner
                </button>
              )}
              
              <button
                onClick={handleClose}
                className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold font-mono tracking-widest transition-all rounded-xl uppercase"
              >
                Close
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 pt-4 border-t border-slate-50">
            <p className="text-[10px] text-slate-400 leading-relaxed font-mono font-medium text-center italic">
              Position QR code within scan area. Ensure adequate lighting for optimal detection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
