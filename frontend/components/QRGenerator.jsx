'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Printer, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { qrProtocol } from '@/lib/services/qrProtocol';

/**
 * QRGenerator Component - Implements the 'Dead Drop' QR system.
 * Accepts a messageId, retrieves it from Dexie, serializes to QR protocol format,
 * signs with ephemeral key, and renders as a QR code.
 */
export default function QRGenerator({ messageId }) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const qrRef = useRef();

  useEffect(() => {
    async function loadMessage() {
      if (!messageId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Retrieve message from Dexie
        const msg = await db.messages.get(messageId);
        
        if (!msg) {
          setError('Message not found in local storage.');
          return;
        }

        // Serialize to QR protocol format
        const qrData = qrProtocol.serializeQR({
          id: msg.id,
          type: msg.type || 'drop',
          timestamp: msg.timestamp,
          content: msg.content
        });

        // Sign with ephemeral key
        const signedData = await qrProtocol.signQR(qrData);

        // Convert to JSON string for QR code
        setMessage(qrProtocol.stringifyQR(signedData));
        setError(null);
      } catch (err) {
        console.error('[QRGenerator] Failed to load message:', err);
        setError('Failed to load message: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    loadMessage();
  }, [messageId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    try {
      const svg = document.getElementById("dead-drop-qr");
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `404-Found-DeadDrop-${messageId.substring(0, 8)}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
        toast.success('Saved to gallery');
      };

      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error('[QRGenerator] Download failed:', err);
      toast.error('Failed to save image');
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto border-slate-200 shadow-sm animate-pulse">
        <div className="h-64 bg-slate-100 flex items-center justify-center">
          <p className="font-mono text-xs text-slate-400">ENCODING PAYLOAD...</p>
        </div>
      </Card>
    );
  }

  if (error || !message) {
    return (
      <Card className="w-full max-w-md mx-auto border-red-100 bg-red-50 shadow-sm">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <p className="font-mono text-sm font-bold text-red-700">DEAD DROP FAILED</p>
            <p className="font-mono text-xs text-red-600 mt-1">{error || 'No message ID provided'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
      <CardHeader className="bg-slate-900 text-white pb-6">
        <CardTitle className="font-mono text-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          DEAD DROP READY
        </CardTitle>
        <CardDescription className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">
          Secure Physical Hand-off Protocol
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-8 flex flex-col items-center space-y-6 bg-white">
        <div className="p-4 bg-white border-8 border-white shadow-xl rounded-lg">
          <QRCode
            id="dead-drop-qr"
            size={256}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            value={message}
            viewBox={`0 0 256 256`}
            level="H" // High error correction for better physical resilience
          />
        </div>
        
        <div className="text-center space-y-2">
          <p className="font-mono text-[10px] text-slate-500 uppercase tracking-tighter">
            Message Fingerprint
          </p>
          <p className="font-mono text-[10px] text-slate-400 break-all bg-slate-50 p-2 rounded border border-slate-100">
            {messageId}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 bg-slate-50 border-t border-slate-100 py-4 print:hidden">
        <Button 
          variant="outline" 
          onClick={handlePrint}
          className="flex-1 font-mono text-[10px] uppercase gap-2 border-slate-200 hover:bg-slate-100"
        >
          <Printer className="w-3 h-3" />
          Print Code
        </Button>
        <Button 
          onClick={handleDownload}
          className="flex-1 font-mono text-[10px] uppercase gap-2 bg-slate-900 text-white hover:bg-slate-800"
        >
          <Download className="w-3 h-3" />
          Save Image
        </Button>
      </CardFooter>
      
      <div className="hidden print:block text-center py-4 border-t border-slate-200">
        <p className="font-mono text-[8px] text-slate-500 uppercase">
          404 FOUND // SECURE OFFLINE MESH TRANSMISSION // {new Date().toISOString()}
        </p>
      </div>
    </Card>
  );
}
