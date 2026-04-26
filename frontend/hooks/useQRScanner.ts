import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db } from '@/lib/db';
import { qrProtocol } from '@/lib/services/qrProtocol';
import { toast } from 'sonner';

interface UseQRScannerReturn {
  isScanning: boolean;
  scanStatus: 'idle' | 'scanning' | 'validating' | 'success' | 'error';
  errorMessage: string | null;
  cameraPermission: 'idle' | 'granted' | 'denied' | 'checking';
  startScanner: () => void;
  stopScanner: () => void;
  resetScanner: () => void;
  handleScanSuccess: (decodedText: string) => Promise<void>;
}

export function useQRScanner(onImportSuccess?: (data: any) => void): UseQRScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'validating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'idle' | 'granted' | 'denied' | 'checking'>('idle');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error('[useQRScanner] Failed to clear scanner:', err);
      }
    }
    setIsScanning(false);
  }, []);

  const resetScanner = useCallback(() => {
    setScanStatus('idle');
    setErrorMessage(null);
  }, []);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    await stopScanner();
    setScanStatus('validating');

    try {
      const payload = qrProtocol.parseQR(decodedText);
      console.log('[useQRScanner] Payload detected:', payload.id);

      const validation = await qrProtocol.isValidQR(payload);

      if (!validation.valid) {
        if (validation.versionMismatch) {
          setScanStatus('error');
          setErrorMessage(`PROTOCOL MISMATCH: QR version ${validation.qrVersion} is higher than app version ${validation.appVersion}. Update required.`);
          toast.error('Protocol Mismatch');
          return;
        }

        setScanStatus('error');
        setErrorMessage(`SECURITY REJECTION: ${validation.error}`);
        toast.error('Invalid QR Code');
        return;
      }

      if (validation.versionMismatch) {
        setScanStatus('error');
        setErrorMessage(`PROTOCOL MISMATCH: QR version ${validation.qrVersion} is higher than app version ${validation.appVersion}. Data may not be understood.`);
        toast.error('Protocol Mismatch');
        return;
      }

      const messageToSave = {
        id: payload.id,
        type: payload.type,
        content: payload.payload,
        timestamp: payload.ts,
        signature: payload.sig,
        authorId: payload.id,
        source: 'physical_drop',
        is_propagated: false,
        ingestedAt: Date.now()
      };

      await db.transaction('rw', db.messages, async () => {
        await db.messages.put(messageToSave);
      });

      setScanStatus('success');
      toast.success('Secure Drop Ingested');
      if (onImportSuccess) onImportSuccess(messageToSave);

    } catch (error) {
      console.error('[useQRScanner] Ingestion failed:', error);
      setScanStatus('error');
      setErrorMessage('INVALID FORMAT: Scanned data is not a recognized 404 Found payload.');
    }
  }, [stopScanner, onImportSuccess]);

  const handleScanFailure = useCallback((error: any) => {
    if (error && error.name === 'NotAllowedError') {
      setCameraPermission('denied');
      toast.error('Camera Access Required');
    }
  }, []);

  const startScanner = useCallback(() => {
    setScanStatus('scanning');
    setCameraPermission('checking');
    setIsScanning(true);
    setErrorMessage(null);

    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          "qr-reader-target",
          { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          false
        );

        scanner.render(handleScanSuccess, handleScanFailure);
        scannerRef.current = scanner;
        setCameraPermission('granted');
      } catch (error) {
        console.error('[useQRScanner] Failed to initialize scanner:', error);
        setScanStatus('error');
        setErrorMessage('Failed to initialize camera. Please check permissions.');
        setCameraPermission('denied');
      }
    }, 100);
  }, [handleScanSuccess, handleScanFailure]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, []);

  return {
    isScanning,
    scanStatus,
    errorMessage,
    cameraPermission,
    startScanner,
    stopScanner,
    resetScanner,
    handleScanSuccess
  };
}
