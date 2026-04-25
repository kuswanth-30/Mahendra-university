/**
 * QRManager - QR Dead Drop System for 404 Found
 * Split-view modal: Generate QR codes from messages / Scan and import QR codes
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'react-qr-code';
import { X, Camera, Printer, Download, ScanLine, AlertTriangle, Check, FileJson } from 'lucide-react';
import { meshSync } from '@/lib/services/meshSync';
import { db, Message } from '@/lib/db';

interface QRManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScannedData {
  type: string;
  title: string;
  description: string;
  timestamp: string;
  parsed: boolean;
  raw: string;
}

export default function QRManager({ isOpen, onClose }: QRManagerProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'scan'>('generate');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner-container';

  // Load messages from Dexie
  useEffect(() => {
    if (isOpen && activeTab === 'generate') {
      loadMessages();
    }
  }, [isOpen, activeTab]);

  const loadMessages = async () => {
    try {
      const allMessages = await db.messages.toArray();
      setMessages(allMessages.slice(0, 20)); // Last 20 messages
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  // Initialize scanner
  const startScanner = useCallback(async () => {
    if (!isOpen || activeTab !== 'scan') return;
    
    setIsScanning(true);
    setError('');
    
    try {
      scannerRef.current = new Html5Qrcode(scannerContainerId);
      
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Silent error - scanning continues
        }
      );
    } catch (err) {
      setError('Camera access denied or not available');
      setIsScanning(false);
    }
  }, [isOpen, activeTab]);

  // Stop scanner
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        // Ignore stop errors
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Handle scan success
  const handleScanSuccess = (decodedText: string) => {
    stopScanner();
    
    try {
      const parsed = JSON.parse(decodedText);
      
      setScannedData({
        type: parsed.type || 'Unknown',
        title: parsed.title || 'Untitled',
        description: parsed.description || '',
        timestamp: parsed.timestamp || new Date().toISOString(),
        parsed: true,
        raw: decodedText,
      });
    } catch (err) {
      // Invalid JSON - show raw preview
      setScannedData({
        type: 'Raw Data',
        title: 'Unrecognized Format',
        description: decodedText.substring(0, 200),
        timestamp: new Date().toISOString(),
        parsed: false,
        raw: decodedText,
      });
    }
  };

  // Import scanned message
  const handleImport = async () => {
    if (!scannedData || !scannedData.parsed) return;
    
    setImportStatus('importing');
    
    try {
      const messageData = {
        ...JSON.parse(scannedData.raw),
        _syncSource: 'qr-dead-drop',
        _syncTimestamp: new Date().toISOString(),
      };
      
      const result = await meshSync.processIncomingMessage(messageData);
      
      if (result.action === 'INSERTED' || result.action === 'UPDATED') {
        setImportStatus('success');
        setTimeout(() => {
          onClose();
          setImportStatus('idle');
          setScannedData(null);
        }, 1500);
      } else if (result.action === 'CONFLICT') {
        setError('Message conflict detected - check ConflictResolver');
        setImportStatus('error');
      } else {
        setError('Message already exists or was ignored');
        setImportStatus('error');
      }
    } catch (err) {
      setError('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setImportStatus('error');
    }
  };

  // Print QR code
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !selectedMessage) return;
    
    const qrData = JSON.stringify({
      type: selectedMessage.type,
      title: selectedMessage.title,
      description: selectedMessage.description,
      timestamp: selectedMessage.timestamp,
      localId: selectedMessage.localId,
    });
    
    printWindow.document.write(`
      <html>
        <head>
          <title>404 Found - QR Dead Drop</title>
          <style>
            body { 
              font-family: 'Consolas', monospace; 
              background: #0D0D19; 
              color: #e0e0e0;
              display: flex; 
              flex-direction: column;
              align-items: center; 
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container { text-align: center; }
            .title { 
              font-size: 14px; 
              font-weight: bold; 
              margin-bottom: 10px;
              color: #00ff41;
            }
            .message-title { 
              font-size: 18px; 
              font-weight: bold; 
              margin-bottom: 20px;
              max-width: 400px;
            }
            .qr-container { 
              background: white; 
              padding: 20px; 
              border-radius: 2px;
              margin-bottom: 20px;
            }
            .footer { 
              font-size: 10px; 
              color: #6b6b7b;
              margin-top: 20px;
            }
            @media print {
              body { background: white; color: black; }
              .title { color: black; }
              .footer { color: #666; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="title">404 FOUND - EMERGENCY MESH NETWORK</div>
            <div class="message-title">${selectedMessage.title}</div>
            <div class="qr-container">
              <div id="qr"></div>
            </div>
            <div class="footer">
              Scan to import into 404 Found mesh<br>
              Generated: ${new Date().toLocaleString()}
            </div>
          </div>
          <script src="https://unpkg.com/react-qr-code@2.0.12/lib/index.js"></script>
          <script>
            // Simple QR generation for print
            const qr = document.getElementById('qr');
            qr.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + 
              encodeURIComponent('${qrData.replace(/'/g, "\\'")}') + '" />';
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // Save QR as image
  const handleSave = () => {
    if (!selectedMessage) return;
    
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `404-found-qr-${selectedMessage.localId || Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Cleanup on unmount/close
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Start scanner when tab changes to scan
  useEffect(() => {
    if (activeTab === 'scan' && isOpen) {
      setScannedData(null);
      setImportStatus('idle');
      setError('');
      startScanner();
    } else {
      stopScanner();
    }
  }, [activeTab, isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  const selectedQRData = selectedMessage ? JSON.stringify({
    type: selectedMessage.type,
    title: selectedMessage.title,
    description: selectedMessage.description,
    timestamp: selectedMessage.timestamp,
    localId: selectedMessage.localId,
  }) : '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90">
      {/* Terminal Aesthetic Modal */}
      <div 
        className="w-full max-w-4xl bg-[#0a0a0a] border border-[#333333] shadow-2xl overflow-hidden"
        style={{ borderRadius: '2px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#111111] border-b border-[#222222]">
          <div className="flex items-center gap-3">
            <ScanLine className="w-5 h-5 text-[#00ff41]" />
            <div>
              <h2 className="text-sm font-bold text-[#00ff41] tracking-wider font-mono">
                QR_DEAD_DROP
              </h2>
              <p className="text-[10px] text-[#555555] font-mono">
                SECURE_OFFLINE_DATA_TRANSFER
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222222] border border-[#333333] text-[#888888] transition-colors"
            style={{ borderRadius: '2px' }}
          >
            <span className="text-xs font-mono">CLOSE</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#222222]">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 px-4 py-3 text-xs font-mono font-medium transition-colors border-b-2 ${
              activeTab === 'generate'
                ? 'border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10'
                : 'border-transparent text-[#6b6b7b] hover:text-[#a0a0b0]'
            }`}
          >
            GENERATE QR
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 px-4 py-3 text-xs font-mono font-medium transition-colors border-b-2 ${
              activeTab === 'scan'
                ? 'border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10'
                : 'border-transparent text-[#6b6b7b] hover:text-[#a0a0b0]'
            }`}
          >
            SCAN QR
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'generate' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Message Selection */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#888888] font-mono uppercase tracking-wider">
                  SELECT_MESSAGE_TO_ENCODE
                </h3>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-sm text-[#555555] font-mono">No messages available</p>
                  ) : (
                    messages.map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => setSelectedMessage(msg)}
                        className={`w-full p-3 text-left border transition-colors ${
                          selectedMessage?.id === msg.id
                            ? 'border-[#00ff41] bg-[#00ff41]/10'
                            : 'border-[#333333] bg-[#151522] hover:border-[#555555]'
                        }`}
                        style={{ borderRadius: '2px' }}
                      >
                        <p className="text-xs font-bold text-[#e0e0e0] font-mono truncate">
                          [{msg.type?.toUpperCase()}] {msg.title}
                        </p>
                        <p className="text-[10px] text-[#6b6b7b] font-mono mt-1">
                          {new Date(msg.timestamp).toLocaleString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* QR Preview */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#888888] font-mono uppercase tracking-wider">
                  QR_PREVIEW
                </h3>
                
                {selectedMessage ? (
                  <div className="space-y-4">
                    <div 
                      className="p-6 bg-white flex items-center justify-center"
                      style={{ borderRadius: '2px' }}
                    >
                      <QRCode
                        value={selectedQRData}
                        size={200}
                        level="H"
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={handlePrint}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 border border-[#00ff41]/50 text-[#00ff41] font-mono text-xs transition-colors"
                        style={{ borderRadius: '2px' }}
                      >
                        <Printer className="w-4 h-4" />
                        PRINT
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 border border-[#00ff41]/50 text-[#00ff41] font-mono text-xs transition-colors"
                        style={{ borderRadius: '2px' }}
                      >
                        <Download className="w-4 h-4" />
                        SAVE
                      </button>
                    </div>
                    
                    <p className="text-[10px] text-[#555555] font-mono text-center">
                      Data size: {selectedQRData.length} bytes
                    </p>
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-[#333333] flex items-center justify-center">
                    <p className="text-sm text-[#555555] font-mono">
                      Select a message to generate QR
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scanner View */}
              {!scannedData ? (
                <div className="space-y-4">
                  <div 
                    id={scannerContainerId}
                    className="w-full h-80 bg-[#151522] border border-[#333333] flex items-center justify-center relative overflow-hidden"
                    style={{ borderRadius: '2px' }}
                  >
                    {!isScanning && !error && (
                      <div className="text-center">
                        <Camera className="w-12 h-12 text-[#333333] mx-auto mb-4" />
                        <p className="text-sm text-[#555555] font-mono">
                          Initializing camera...
                        </p>
                      </div>
                    )}
                    
                    {error && (
                      <div className="text-center p-4">
                        <AlertTriangle className="w-12 h-12 text-[#ff0040] mx-auto mb-4" />
                        <p className="text-sm text-[#ff0040] font-mono">{error}</p>
                        <button
                          onClick={startScanner}
                          className="mt-4 px-4 py-2 bg-[#ff0040]/10 border border-[#ff0040]/50 text-[#ff0040] font-mono text-xs"
                          style={{ borderRadius: '2px' }}
                        >
                          RETRY
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {isScanning && (
                    <p className="text-xs text-[#00ff41] font-mono text-center animate-pulse">
                      SCANNING FOR QR CODE...
                    </p>
                  )}
                </div>
              ) : (
                /* Preview Card */
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#888888] font-mono uppercase tracking-wider flex items-center gap-2">
                    <FileJson className="w-4 h-4" />
                    DECODED_MESSAGE_PREVIEW
                  </h3>
                  
                  <div 
                    className={`p-4 border ${
                      scannedData.parsed 
                        ? 'border-[#00ff41]/50 bg-[#00ff41]/5' 
                        : 'border-[#ff0040]/50 bg-[#ff0040]/5'
                    }`}
                    style={{ borderRadius: '2px' }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-1 text-[10px] font-bold font-mono border ${
                        scannedData.parsed
                          ? 'border-[#00ff41] text-[#00ff41]'
                          : 'border-[#ff0040] text-[#ff0040]'
                      }`}>
                        {scannedData.type.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[#6b6b7b] font-mono">
                        {new Date(scannedData.timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-bold text-[#e0e0e0] font-mono mb-2">
                      {scannedData.title}
                    </h4>
                    
                    <p className="text-sm text-[#a0a0b0] font-mono leading-relaxed">
                      {scannedData.description}
                    </p>
                    
                    {!scannedData.parsed && (
                      <p className="mt-3 text-xs text-[#ff0040] font-mono">
                        Warning: Unrecognized format. Import may fail.
                      </p>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleImport}
                      disabled={importStatus === 'importing' || !scannedData.parsed}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs font-bold transition-colors ${
                        importStatus === 'success'
                          ? 'bg-[#00ff41] text-black'
                          : importStatus === 'error'
                          ? 'bg-[#ff0040]/20 border border-[#ff0040] text-[#ff0040]'
                          : 'bg-[#00ff41]/10 hover:bg-[#00ff41]/20 border border-[#00ff41]/50 text-[#00ff41]'
                      }`}
                      style={{ borderRadius: '2px' }}
                    >
                      {importStatus === 'importing' ? (
                        <>
                          <ScanLine className="w-4 h-4 animate-spin" />
                          IMPORTING...
                        </>
                      ) : importStatus === 'success' ? (
                        <>
                          <Check className="w-4 h-4" />
                          IMPORTED!
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          IMPORT TO MESH
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => {
                        setScannedData(null);
                        setImportStatus('idle');
                        setError('');
                        startScanner();
                      }}
                      className="px-4 py-3 bg-[#1a1a1a] hover:bg-[#222222] border border-[#333333] text-[#888888] font-mono text-xs transition-colors"
                      style={{ borderRadius: '2px' }}
                    >
                      SCAN AGAIN
                    </button>
                  </div>
                  
                  {error && (
                    <p className="text-xs text-[#ff0040] font-mono text-center">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
