'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import QRGenerator from './QRGenerator';
import QRScanner from './QRScanner';
import { messageService } from '@/lib/services/MessageService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function QRManager() {
  const [manualMessage, setManualMessage] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  // Handle manual message encoding
  const handleGenerate = () => {
    if (!manualMessage.trim()) {
      toast.error('Please enter a message to encode');
      return;
    }

    // Prepare JSON for QR code
    const qrData = JSON.stringify({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: manualMessage,
      timestamp: Date.now(),
      metadata: {
        is_propagated: true,
        source: 'qr_dead_drop'
      }
    });

    setQrValue(qrData);
    toast.success('QR Code Generated');
  };

  // Start Scanner
  const startScanner = () => {
    setIsScanning(true);
    
    // Brief delay to ensure container is rendered
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render(onScanSuccess, onScanFailure);
      scannerRef.current = scanner;
    }, 100);
  };

  // Stop Scanner
  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(err => console.error('Failed to clear scanner', err));
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  // Successful Scan
  const onScanSuccess = async (decodedText) => {
    try {
      const parsedData = JSON.parse(decodedText);
      
      // Basic validation
      if (!parsedData.id || !parsedData.content) {
        throw new Error('Invalid QR Data structure');
      }

      // Add propagation flag
      const messageToSave = {
        ...parsedData,
        content: {
          ...parsedData.content,
          metadata: {
            ...(parsedData.content?.metadata || {}),
            is_propagated: true
          }
        }
      };

      await messageService.saveMessage(messageToSave);
      
      toast.success('Message imported successfully via QR');
      stopScanner();
    } catch (error) {
      console.error('[QRScanner] Parse error:', error);
      toast.error('Invalid QR Code: ' + error.message);
    }
  };

  const onScanFailure = (error) => {
    // Failures happen constantly while scanning, we usually ignore them
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error('Failed to clear scanner', err));
      }
    };
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto bg-slate-950/40 backdrop-blur-xl border-white/5 shadow-2xl p-6 overflow-hidden">
      <CardHeader className="p-0 mb-8">
        <CardTitle className="font-mono text-2xl font-black text-slate-100 uppercase tracking-tighter flex items-center gap-3">
          <div className="relative">
            <span className="w-4 h-4 bg-[#00ff41] rounded-full flex shadow-[0_0_15px_rgba(0,255,65,0.6)]" />
            <span className="absolute inset-0 w-4 h-4 bg-[#00ff41] rounded-full animate-ping opacity-40" />
          </div>
          <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">QR DEAD DROP SYSTEM</span>
        </CardTitle>
        <CardDescription className="font-mono text-[10px] text-[#00ff41]/60 uppercase tracking-[0.2em] mt-2">
          SECURE OFFLINE STORE-AND-FORWARD BRIDGE
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 font-mono text-xs bg-black/40 border border-white/5 p-1 rounded-lg">
            <TabsTrigger 
              value="generator" 
              className="rounded-md data-[state=active]:bg-[#00ff41]/10 data-[state=active]:text-[#00ff41] data-[state=active]:border data-[state=active]:border-[#00ff41]/20 transition-all duration-300 py-2"
            >
              ENCODER.EXE
            </TabsTrigger>
            <TabsTrigger 
              value="scanner" 
              className="rounded-md data-[state=active]:bg-[#00ff41]/10 data-[state=active]:text-[#00ff41] data-[state=active]:border data-[state=active]:border-[#00ff41]/20 transition-all duration-300 py-2"
            >
              DECODER.SYS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generator" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="space-y-3">
              <div className="flex justify-between items-end px-1">
                <label className="text-[10px] font-black font-mono text-slate-500 uppercase tracking-widest">Input_Buffer</label>
                <span className="text-[9px] font-mono text-slate-600">{manualMessage.length} BYTES</span>
              </div>
              <textarea 
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                placeholder="Enter message to encode..."
                className="w-full min-h-[120px] bg-black/30 border border-white/10 rounded-xl p-4 font-mono text-sm text-slate-100 placeholder:text-slate-700 outline-none focus:border-[#00ff41]/40 focus:ring-1 focus:ring-[#00ff41]/20 transition-all duration-300 resize-none shadow-inner"
              />
            </div>

            <button
              onClick={handleGenerate}
              className="w-full py-4 bg-[#00ff41]/5 hover:bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/20 rounded-xl font-mono text-xs font-bold uppercase tracking-[0.3em] transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,255,65,0.15)] active:scale-[0.98] group"
            >
              GENERATE_ENCODED_STREAM
            </button>

            {qrValue && (
              <div className="pt-8 mt-8 border-t border-white/5 animate-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center gap-6">
                  <div className="p-6 bg-white rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.1)] group cursor-none">
                    <QRGenerator content={qrValue} />
                  </div>
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">
                    Encrypted Payload Ready for Physical Relay
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scanner" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <QRScanner />
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="p-0 mt-10">
        <div className="w-full flex justify-between items-center bg-black/60 border border-white/5 rounded-lg px-4 py-2 text-[#00ff41]/40 font-mono text-[9px] uppercase tracking-widest shadow-inner">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#00ff41] rounded-full animate-pulse shadow-[0_0_5px_rgba(0,255,65,0.8)]" />
            STATUS: SYSTEM_OPERATIONAL
          </div>
          <div className="flex gap-4">
            <span>LINK: ACTIVE</span>
            <span className="text-slate-600">VER: 1.0.4-MESH</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

