'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, ShieldAlert, Scan, Camera, X } from 'lucide-react';
import { useQRScanner } from '@/hooks/useQRScanner';

export default function QRScanner({ onImportSuccess }) {
  const {
    isScanning,
    scanStatus,
    errorMessage,
    cameraPermission,
    startScanner,
    stopScanner,
    resetScanner
  } = useQRScanner(onImportSuccess);

  return (
    <Card className="w-full max-w-md mx-auto bg-slate-950 border-slate-800 text-slate-100 font-mono shadow-2xl overflow-hidden">
      <CardHeader className="border-b border-slate-800 bg-slate-900/50">
        <CardTitle className="text-xs uppercase tracking-[0.2em] flex items-center gap-2">
          <Scan className="w-4 h-4 text-blue-400" />
          Scan QR
        </CardTitle>
        <CardDescription className="text-[10px] text-slate-500 uppercase">
          Secure Optical Ingestion Protocol
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {!isScanning && scanStatus === 'idle' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 space-y-6">
            <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:border-blue-500/50 transition-colors cursor-pointer" onClick={startScanner}>
              <Camera className="w-10 h-10 text-slate-600 animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-300">AWAITING OPTICAL INPUT</p>
              <p className="text-[9px] text-slate-600 italic">ENSURE PAYLOAD IS WITHIN FRAME</p>
            </div>
            <Button 
              onClick={startScanner}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] uppercase h-10 tracking-widest"
            >
              Initialize Camera
            </Button>
          </div>
        )}

        {cameraPermission === 'denied' && scanStatus === 'idle' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 space-y-6 text-center">
            <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-rose-500">CAMERA ACCESS REQUIRED</p>
              <p className="text-[10px] text-slate-400 leading-relaxed max-w-[240px]">
                Please enable camera permissions in your browser settings to scan QR codes.
              </p>
            </div>
            <Button 
              onClick={startScanner}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase"
            >
              Retry Permission
            </Button>
          </div>
        )}

        {isScanning && (
          <div className="relative">
            {/* Fixed overlay with backdrop blur */}
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="relative w-full max-w-md">
                {/* Close button */}
                <button
                  onClick={stopScanner}
                  className="absolute -top-12 right-0 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                {/* Scanner container with glowing border guide */}
                <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl">
                  <div id="qr-reader-target" className="w-full aspect-square" />
                  
                  {/* Glowing green alignment guide */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-[#00ff41]/30 rounded-2xl" />
                    <div className="absolute inset-4 border-2 border-[#00ff41]/50 rounded-xl shadow-[0_0_30px_rgba(0,255,65,0.3)]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-[#00ff41]/20 rounded-lg shadow-[inset_0_0_20px_rgba(0,255,65,0.1)]" />
                  </div>

                  {/* Status overlay */}
                  <div className="absolute top-4 left-4 right-4 flex justify-between items-center px-3 py-2 bg-black/60 backdrop-blur-sm rounded-lg border border-white/10">
                    <span className="text-[9px] text-[#00ff41] flex items-center gap-2">
                      <span className="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse" />
                      SCANNING
                    </span>
                    <span className="text-[9px] text-slate-400">10 FPS</span>
                  </div>

                  {/* Bottom controls */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <Button 
                      onClick={stopScanner}
                      variant="ghost"
                      className="w-full text-slate-400 hover:text-white hover:bg-white/10 text-[10px] uppercase border border-white/10"
                    >
                      Stop Scanner
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {scanStatus === 'validating' && (
          <div className="py-20 flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-blue-400 animate-pulse uppercase tracking-widest">Verifying Integrity...</p>
          </div>
        )}

        {scanStatus === 'success' && (
          <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-emerald-400">QR SCANNED SUCCESSFULLY</p>
              <p className="text-[10px] text-slate-500">Payload verified and stored. Propagation flagged for next mesh peer.</p>
            </div>
            <Button 
              onClick={resetScanner}
              variant="outline"
              className="w-full border-slate-800 hover:bg-slate-900 text-[10px] uppercase"
            >
              Scan Another QR
            </Button>
          </div>
        )}

        {scanStatus === 'error' && (
          <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-rose-500">SCAN FAILED</p>
              <p className="text-[10px] text-slate-400 leading-relaxed max-w-[240px]">
                {errorMessage}
              </p>
            </div>
            <Button 
              onClick={resetScanner}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase"
            >
              Try Again
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-black/40 border-t border-slate-800 py-3 flex justify-between items-center">
        <div className="flex items-center gap-1.5 opacity-50">
          <div className={`w-1.5 h-1.5 rounded-full ${scanStatus === 'scanning' ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[8px] uppercase tracking-tighter">SECURE CHANNEL</span>
        </div>
        <span className="text-[8px] text-slate-600 uppercase tracking-tighter">E2EE-ECDSA-VERIFIED</span>
      </CardFooter>
    </Card>
  );
}
