'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db } from '@/lib/db';
import { qrProtocol } from '@/lib/services/qrProtocol';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, ShieldAlert, Clock, Scan } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QRScanner Component - Secure 'Physical Drop' Ingestion
 * 
 * Features:
 * - One-shot scanning (stops after success)
 * - Security Pipeline: Schema validation, signature verification, version handling
 * - Version Handling: Protocol Mismatch warning if v > current app version
 * - Dispatch to appropriate service based on type
 * - Gossip Trigger: Saves with is_propagated: false for automatic broadcast
 * - Minimalist Dark Mode UI
 */
export default function QRScanner({ onImportSuccess }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle'); // idle, scanning, validating, success, error
  const [errorMessage, setScanError] = useState(null);
  const scannerRef = useRef(null);

  const startScanner = () => {
    setScanStatus('scanning');
    setIsScanning(true);
    setScanError(null);

    // Brief delay to ensure container is ready
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader-target",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(handleScanSuccess, handleScanFailure);
      scannerRef.current = scanner;
    }, 100);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error('[QRScanner] Failed to clear scanner:', err);
      }
    }
    setIsScanning(false);
  };

  const handleScanSuccess = async (decodedText) => {
    // ONE-SHOT: Stop scanning immediately
    await stopScanner();
    setScanStatus('validating');

    try {
      // 1. Parse JSON using qrProtocol
      const payload = qrProtocol.parseQR(decodedText);
      console.log('[QRScanner] Payload detected:', payload.id);

      // 2. Security Pipeline: Validate schema and signature
      const validation = await qrProtocol.isValidQR(payload);

      if (!validation.valid) {
        // Check for version mismatch
        if (validation.versionMismatch) {
          setScanStatus('error');
          setScanError(`PROTOCOL MISMATCH: QR version ${validation.qrVersion} is higher than app version ${validation.appVersion}. Update required.`);
          toast.error('Protocol Mismatch');
          return;
        }

        // Other validation errors
        setScanStatus('error');
        setScanError(`SECURITY REJECTION: ${validation.error}`);
        toast.error('Invalid QR Code');
        return;
      }

      // 3. Version Handling: Check if version is compatible
      if (validation.versionMismatch) {
        setScanStatus('error');
        setScanError(`PROTOCOL MISMATCH: QR version ${validation.qrVersion} is higher than app version ${validation.appVersion}. Data may not be understood.`);
        toast.error('Protocol Mismatch');
        return;
      }

      // 4. Dispatch to appropriate service based on type
      dispatchPayload(payload);

      // 5. Save to db.messages with is_propagated: false for gossip trigger
      const messageToSave = {
        id: payload.id,
        type: payload.type,
        content: payload.payload,
        timestamp: payload.ts,
        signature: payload.sig,
        authorId: payload.id, // Using id as authorId for QR messages
        source: 'physical_drop',
        is_propagated: false, // GossipEngine will detect this and broadcast
        ingestedAt: Date.now()
      };

      await db.transaction('rw', db.messages, async () => {
        await db.messages.put(messageToSave);
      });

      setScanStatus('success');
      toast.success('Secure Drop Ingested');
      if (onImportSuccess) onImportSuccess(messageToSave);

    } catch (error) {
      console.error('[QRScanner] Ingestion failed:', error);
      setScanStatus('error');
      setScanError('INVALID FORMAT: Scanned data is not a recognized 404 Found payload.');
    }
  };

  const handleScanFailure = (error) => {
    // Logic for constant scanning failures - usually ignored
  };

  // Dispatch payload to appropriate service based on type
  const dispatchPayload = (payload) => {
    switch (payload.type) {
      case 'alert':
        // Trigger in-app notification
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('qr:alert_received', {
            detail: { payload }
          }));
        }
        toast.warning('Alert Received');
        break;

      case 'news':
        // Add to news feed
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('qr:news_received', {
            detail: { payload }
          }));
        }
        break;

      case 'route':
        // Add to routes
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('qr:route_received', {
            detail: { payload }
          }));
        }
        break;

      case 'dm':
        // Add to direct messages
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('qr:dm_received', {
            detail: { payload }
          }));
        }
        toast.info('Direct Message Received');
        break;

      case 'drop':
      default:
        // Generic drop
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('qr:drop_received', {
            detail: { payload }
          }));
        }
        break;
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto bg-slate-950 border-slate-800 text-slate-100 font-mono shadow-2xl overflow-hidden">
      <CardHeader className="border-b border-slate-800 bg-slate-900/50">
        <CardTitle className="text-xs uppercase tracking-[0.2em] flex items-center gap-2">
          <Scan className="w-4 h-4 text-blue-400" />
          Secure Ingestion Protocol
        </CardTitle>
        <CardDescription className="text-[10px] text-slate-500 uppercase">
          Node: physical-drop-v1.0.4
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {!isScanning && scanStatus !== 'success' && scanStatus !== 'error' && scanStatus !== 'validating' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 space-y-6">
            <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-blue-500/50 transition-colors">
              <Scan className="w-10 h-10 text-slate-600 animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-300">AWAITING OPTICAL INPUT</p>
              <p className="text-[9px] text-slate-600 italic">ENSURE PAYLOAD IS WITHIN FRAME</p>
            </div>
            <Button 
              onClick={startScanner}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] uppercase h-10 tracking-widest"
            >
              Initialize Optical Link
            </Button>
          </div>
        )}

        {isScanning && (
          <div className="relative">
            <div id="qr-reader-target" className="w-full aspect-square bg-black overflow-hidden"></div>
            <div className="absolute inset-0 border-[40px] border-slate-950/40 pointer-events-none"></div>
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center px-2 py-1 bg-black/60 rounded text-[9px] text-blue-400">
              <span className="animate-pulse">● OPTICAL LINK ACTIVE</span>
              <span>10 FPS</span>
            </div>
            <div className="p-4 bg-slate-900 border-t border-slate-800">
              <Button 
                onClick={stopScanner}
                variant="ghost"
                className="w-full text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] uppercase"
              >
                Terminate Link
              </Button>
            </div>
          </div>
        )}

        {scanStatus === 'validating' && (
          <div className="py-20 flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-blue-400 animate-pulse uppercase tracking-widest">Verifying Integrity...</p>
          </div>
        )}

        {scanStatus === 'success' && (
          <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-emerald-400">INGESTION COMPLETE</p>
              <p className="text-[10px] text-slate-500">Payload verified and stored. Propagation flagged for next mesh peer.</p>
            </div>
            <Button 
              onClick={() => { setScanStatus('idle'); }}
              variant="outline"
              className="w-full border-slate-800 hover:bg-slate-900 text-[10px] uppercase"
            >
              Scan Another Drop
            </Button>
          </div>
        )}

        {scanStatus === 'error' && (
          <div className="py-16 px-8 flex flex-col items-center space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-rose-500">INGESTION REJECTED</p>
              <p className="text-[10px] text-slate-400 leading-relaxed max-w-[240px]">
                {errorMessage}
              </p>
            </div>
            <Button 
              onClick={() => { setScanStatus('idle'); }}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase"
            >
              Reset Protocol
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
