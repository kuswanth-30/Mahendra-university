'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, ShieldAlert, Scan, Camera, X, Upload } from 'lucide-react';
import { useQRScanner } from '@/hooks/useQRScanner';
import { Html5Qrcode } from 'html5-qrcode';

export default function QRScanner({ onImportSuccess }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    isScanning,
    scanStatus,
    errorMessage,
    cameraPermission,
    startScanner,
    stopScanner,
    resetScanner,
    handleScanSuccess
  } = useQRScanner(onImportSuccess);

  const handleStartScanner = () => {
    setIsModalOpen(true);
    startScanner();
  };

  const handleStopScanner = async () => {
    await stopScanner();
    setIsModalOpen(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-target");
      const decodedText = await html5QrCode.scanFile(file, true);
      handleScanSuccess(decodedText);
    } catch (err) {
      console.error("QR Upload Error:", err);
    }
  };

  return (
    <>
      <Card className="w-full max-w-md mx-auto bg-slate-950 border-slate-800 text-slate-100 font-mono shadow-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 bg-slate-900/50">
          <CardTitle className="text-xs uppercase tracking-[0.2em] flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#00ff41]" />
            DECODER.SYS
          </CardTitle>
          <CardDescription className="text-[10px] text-slate-500 uppercase">
            Secure Optical Ingestion Protocol
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {scanStatus === 'idle' && (
            <div className="flex flex-col items-center justify-center py-12 px-8 space-y-6">
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:border-[#00ff41]/50 transition-colors cursor-pointer group" onClick={handleStartScanner}>
                  <Camera className="w-10 h-10 text-slate-600 group-hover:text-[#00ff41] transition-colors" />
                </div>
                <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:border-blue-500/50 transition-colors cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-10 h-10 text-slate-600 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

              <div className="text-center space-y-2">
                <p className="text-xs text-slate-300 uppercase tracking-widest">Select Input Method</p>
                <p className="text-[9px] text-slate-600 italic uppercase">Direct Optical or File Ingestion</p>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full">
                <Button onClick={handleStartScanner} className="bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 text-[10px] uppercase h-10 tracking-widest">
                  <Camera className="w-3 h-3 mr-2" /> Camera
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] uppercase h-10 tracking-widest">
                  <Upload className="w-3 h-3 mr-2" /> Upload
                </Button>
              </div>
            </div>
          )}

          {scanStatus === 'validating' && (
            <div className="py-20 flex flex-col items-center space-y-4">
              <div className="w-12 h-12 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#00ff41] animate-pulse uppercase tracking-widest">Verifying Integrity...</p>
            </div>
          )}

          {scanStatus === 'success' && (
            <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-emerald-400">INGESTION COMPLETE</p>
              <Button onClick={resetScanner} variant="outline" className="w-full border-slate-800 hover:bg-slate-900 text-[10px] uppercase">Scan Another</Button>
            </div>
          )}

          {scanStatus === 'error' && (
            <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-10 h-10 text-rose-500" />
              </div>
              <p className="text-sm font-bold text-rose-500">INGESTION REJECTED</p>
              <p className="text-[10px] text-slate-400 max-w-[240px]">{errorMessage}</p>
              <Button onClick={resetScanner} className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase">Reset Protocol</Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-black/40 border-t border-slate-800 py-3 flex justify-between items-center">
          <div className="flex items-center gap-1.5 opacity-50">
            <div className={`w-1.5 h-1.5 rounded-full ${isScanning ? 'bg-[#00ff41] animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[8px] uppercase tracking-tighter">SECURE CHANNEL</span>
          </div>
          <span className="text-[8px] text-slate-600 uppercase tracking-tighter">E2EE-ECDSA-VERIFIED</span>
        </CardFooter>
      </Card>

      {/* MODAL PORTAL: Ensures the scanner is NOT clipped by parent containers */}
      {mounted && isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 overflow-hidden">
          <div className="relative w-full max-w-lg aspect-square bg-black border border-[#00ff41]/30 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,255,65,0.2)]">
            {/* The Scanner Feed */}
            <div id="qr-reader-target" className="w-full h-full" />
            
            {/* Visual Alignment Guides */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute top-10 left-10 w-16 h-16 border-t-4 border-l-4 border-[#00ff41] rounded-tl-2xl shadow-[0_0_20px_rgba(0,255,65,0.5)]" />
              <div className="absolute top-10 right-10 w-16 h-16 border-t-4 border-r-4 border-[#00ff41] rounded-tr-2xl shadow-[0_0_20px_rgba(0,255,65,0.5)]" />
              <div className="absolute bottom-10 left-10 w-16 h-16 border-b-4 border-l-4 border-[#00ff41] rounded-bl-2xl shadow-[0_0_20px_rgba(0,255,65,0.5)]" />
              <div className="absolute bottom-10 right-10 w-16 h-16 border-b-4 border-r-4 border-[#00ff41] rounded-br-2xl shadow-[0_0_20px_rgba(0,255,65,0.5)]" />
              
              {/* Center Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <div className="w-64 h-64 border border-[#00ff41] rounded-full" />
                <div className="absolute w-full h-[1px] bg-[#00ff41]" />
                <div className="absolute w-[1px] h-full bg-[#00ff41]" />
              </div>
            </div>

            {/* Header Status Bar (Floating Inside) */}
            <div className="absolute top-6 left-6 right-6 z-20 flex justify-between items-center px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl">
              <span className="text-[10px] text-[#00ff41] font-mono tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse shadow-[0_0_8px_#00ff41]" />
                LINK: SECURE_INGESTION
              </span>
              <button onClick={handleStopScanner} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Buttons (Below the Scanner Window) */}
          <div className="mt-8 flex gap-4 w-full max-w-lg">
            <Button 
              onClick={handleStopScanner}
              className="flex-1 py-8 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/30 font-mono text-xs font-bold uppercase tracking-[0.3em] transition-all rounded-2xl"
            >
              TERMINATE SCAN
            </Button>
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="px-8 py-8 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 font-mono text-xs font-bold uppercase tracking-[0.3em] transition-all rounded-2xl flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              UPLOAD FROM GALLERY
            </Button>
          </div>

          <p className="mt-6 text-slate-500 font-mono text-[9px] uppercase tracking-[0.4em] animate-pulse">
            Position payload within primary detection zone
          </p>
        </div>,
        document.body
      )}
    </>
  );
}
