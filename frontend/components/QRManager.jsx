'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import QRGenerator from './QRGenerator';
import QRScanner from './QRScanner';
import { messageService } from '@/lib/services/MessageService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function QRManager() {
  const [messages, setMessages] = useState([]);
  const [selectedMessageId, setSelectedMessageId] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  // Load messages for the generator
  useEffect(() => {
    const loadMessages = async () => {
      const msgs = await messageService.getMessages();
      setMessages(msgs);
      if (msgs.length > 0 && !selectedMessageId) {
        setSelectedMessageId(msgs[0].id);
      }
    };
    loadMessages();
  }, [selectedMessageId]);

  // Handle message selection for generation
  const handleGenerate = () => {
    const msg = messages.find(m => m.id === selectedMessageId);
    if (!msg) {
      toast.error('Please select a message first');
      return;
    }

    // Prepare JSON for QR code
    const qrData = JSON.stringify({
      ...msg,
      metadata: {
        ...msg.metadata,
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
    // console.warn(`Code scan error = ${error}`);
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
    <Card className="w-full max-w-2xl mx-auto border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="font-mono text-xl flex items-center gap-2">
          <span className="w-3 h-3 bg-slate-900 rounded-full animate-pulse" />
          QR DEAD DROP SYSTEM
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          OFFLINE STORE-AND-FORWARD BRIDGE
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 font-mono text-xs bg-slate-100 p-1">
            <TabsTrigger value="generator">GENERATOR</TabsTrigger>
            <TabsTrigger value="scanner">SCANNER</TabsTrigger>
          </TabsList>

          <TabsContent value="generator" className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-500 uppercase">Select Message to Encode</label>
              <Select value={selectedMessageId} onValueChange={setSelectedMessageId}>
                <SelectTrigger className="font-mono text-sm border-slate-200">
                  <SelectValue placeholder="Select a message..." />
                </SelectTrigger>
                <SelectContent>
                  {messages.length === 0 ? (
                    <SelectItem value="none" disabled>No messages found</SelectItem>
                  ) : (
                    messages.map((msg) => (
                      <SelectItem key={msg.id} value={msg.id} className="font-mono text-xs">
                        {msg.id.substring(0, 8)}... - {JSON.stringify(msg.content).substring(0, 30)}...
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedMessageId && selectedMessageId !== 'none' && (
              <div className="pt-4 border-t border-slate-100">
                <QRGenerator messageId={selectedMessageId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="scanner" className="space-y-4">
            <QRScanner />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="bg-slate-50 border-t border-slate-100 py-3">
        <div className="w-full flex justify-between items-center opacity-60">
          <span className="font-mono text-[10px] uppercase">Status: System Operational</span>
          <span className="font-mono text-[10px]">VER: 1.0.4-MESH</span>
        </div>
      </CardFooter>
    </Card>
  );
}
