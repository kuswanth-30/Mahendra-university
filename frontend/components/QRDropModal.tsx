'use client';

import { useState, useEffect } from 'react';
import { X, Crosshair, QrCode, Share2, Camera, Loader2, CheckCircle } from 'lucide-react';

interface QRDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (data: string) => void;
}

type ScanState = 'idle' | 'scanning' | 'success' | 'error';

export default function QRDropModal({ isOpen, onClose, onScanComplete }: QRDropModalProps) {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setScanState('idle');
      setScannedData(null);
      setErrorMessage('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleScan = async () => {
    setScanState('scanning');
    setErrorMessage('');
    
    // Simulate scanning delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate 80% success rate
    if (Math.random() > 0.2) {
      const mockData = 'RESUPPLY_STATION_42:Medical_Supplies:Zone_A';
      setScannedData(mockData);
      setScanState('success');
      onScanComplete?.(mockData);
    } else {
      setErrorMessage('Unable to read QR code. Try again.');
      setScanState('error');
    }
  };

  const handleRetry = () => {
    setScanState('idle');
    setErrorMessage('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-zinc-900 rounded-lg w-full max-w-md shadow-2xl border border-zinc-700"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-400" />
              <h2 id="qr-modal-title" className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">
                Data Exchange
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-500 hover:text-zinc-300"
              aria-label="Cancel and close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Scanner Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Scan Data Drop</h3>

              {/* Scanner Viewfinder */}
              <div className="relative bg-zinc-950 rounded-lg aspect-square flex items-center justify-center overflow-hidden border border-zinc-800">
                {/* Grid overlay */}
                <div className="absolute inset-0 opacity-10">
                  <div className="w-full h-full" style={{
                    backgroundImage: 'linear-gradient(zinc-800 1px, transparent 1px), linear-gradient(90deg, zinc-800 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                  }} />
                </div>

                {/* Scanning State */}
                {scanState === 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                    <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-3" />
                    <span className="text-xs text-zinc-400 font-mono">SCANNING...</span>
                  </div>
                )}

                {/* Success State */}
                {scanState === 'success' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-zinc-900/90">
                    <CheckCircle className="w-12 h-12 text-emerald-400 mb-3" />
                    <span className="text-sm text-emerald-400 font-mono font-bold">DATA CAPTURED</span>
                    <span className="text-xs text-zinc-500 mt-2 font-mono">{scannedData}</span>
                  </div>
                )}

                {/* Error State */}
                {scanState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-zinc-900/90">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                      <X className="w-6 h-6 text-red-400" />
                    </div>
                    <span className="text-sm text-red-400 font-mono font-bold">SCAN FAILED</span>
                    <span className="text-xs text-zinc-500 mt-2 text-center px-8">{errorMessage}</span>
                  </div>
                )}

                {/* Idle State - Crosshair */}
                {scanState === 'idle' && (
                  <div className="relative z-10 flex items-center justify-center">
                    <div className="relative">
                      <Crosshair className="w-10 h-10 text-blue-500/60" strokeWidth={1.5} />
                      <div className="absolute inset-0 animate-pulse">
                        <div className="absolute inset-0 border border-blue-500/30 rounded-full" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Corner brackets */}
                <div className="absolute inset-4 z-10 pointer-events-none">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-blue-500/50" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-blue-500/50" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-blue-500/50" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-blue-500/50" />
                </div>
              </div>

              {/* Scan Action Button */}
              {scanState === 'idle' && (
                <button 
                  onClick={handleScan}
                  className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Scan QR Code
                </button>
              )}

              {scanState === 'error' && (
                <button 
                  onClick={handleRetry}
                  className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Retry Scan
                </button>
              )}

              {scanState === 'success' && (
                <button 
                  onClick={handleRetry}
                  className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 text-sm font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Scan Another
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-800" />

            {/* Generator Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Your Data Relay</h3>

              {/* QR Code Display */}
              <div className="bg-zinc-950 rounded-lg p-4 flex items-center justify-center aspect-square border border-zinc-800">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full" viewBox="0 0 200 200">
                    <rect x="10" y="10" width="180" height="180" fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" />
                    <g fill="rgb(244, 244, 245)">
                      <rect x="20" y="20" width="35" height="35" />
                      <rect x="26" y="26" width="23" height="23" fill="rgb(9, 9, 11)" />
                      <rect x="30" y="30" width="15" height="15" fill="rgb(244, 244, 245)" />
                      <rect x="145" y="20" width="35" height="35" />
                      <rect x="151" y="26" width="23" height="23" fill="rgb(9, 9, 11)" />
                      <rect x="155" y="30" width="15" height="15" fill="rgb(244, 244, 245)" />
                      <rect x="20" y="145" width="35" height="35" />
                      <rect x="26" y="151" width="23" height="23" fill="rgb(9, 9, 11)" />
                      <rect x="30" y="155" width="15" height="15" fill="rgb(244, 244, 245)" />
                    </g>
                    <g fill="rgb(244, 244, 245)" opacity="0.8">
                      <rect x="65" y="65" width="8" height="8" />
                      <rect x="75" y="75" width="8" height="8" />
                      <rect x="85" y="65" width="8" height="8" />
                      <rect x="95" y="85" width="8" height="8" />
                      <rect x="65" y="95" width="8" height="8" />
                      <rect x="75" y="105" width="8" height="8" />
                      <rect x="105" y="75" width="8" height="8" />
                      <rect x="115" y="95" width="8" height="8" />
                      <rect x="85" y="115" width="8" height="8" />
                      <rect x="125" y="105" width="8" height="8" />
                      <rect x="95" y="125" width="8" height="8" />
                      <rect x="115" y="125" width="8" height="8" />
                    </g>
                  </svg>
                </div>
              </div>

              {/* Share Button */}
              <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 border border-zinc-700">
                <Share2 className="w-4 h-4" />
                Share My Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
