'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, AlertTriangle, QrCode, X, MessageSquare, RotateCw, ShieldAlert } from 'lucide-react';
import QRScanner from './QRScanner';
import AlertModal from './AlertModal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from './ToastContainer';
import { messageService } from '@/lib/services/MessageService';
import { geospatialService } from '@/lib/services/geospatial';

export default function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'Alert' | 'News'>('Alert');
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (isOpen && fabRef.current) {
      const rect = fabRef.current.getBoundingClientRect();
      const menuWidth = 220; // w-48 + padding
      const menuHeight = 240; // Approximate menu height
      
      // Position menu above the FAB, but check if it goes off-screen
      let top = rect.top - menuHeight - 10;
      let left = rect.left + rect.width / 2 - menuWidth / 2;
      
      // If would go off top of screen, position below FAB instead
      if (top < 10) {
        top = rect.bottom + 10;
      }
      
      // Ensure menu stays within horizontal bounds
      const maxLeft = window.innerWidth - menuWidth - 10;
      if (left > maxLeft) {
        left = maxLeft;
      }
      if (left < 10) {
        left = 10;
      }
      
      setPopoverPosition({ top, left });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        fabRef.current &&
        !fabRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleScanQR = () => {
    setIsQRScannerOpen(true);
    setIsOpen(false);
  };

  const handleCreateAlert = () => {
    setModalType('Alert');
    setIsAlertModalOpen(true);
    setIsOpen(false);
  };

  const handleCreateMessage = () => {
    setModalType('News');
    setIsAlertModalOpen(true);
    setIsOpen(false);
  };

  const handleCloseMenu = () => {
    setIsOpen(false);
  };

  const handleAlertSubmit = async (data: { 
    title: string; 
    message: string; 
    priority: string;
    lat?: number;
    long?: number;
    radius?: number;
    is_fragmented?: boolean;
    total_shards?: number;
    threshold?: number;
  }) => {
    try {
      const location = geospatialService.getCurrentLocation();
      
      // Build message content
      const content = {
        title: data.title,
        body: data.message,
        priority: data.priority,
      };
      
      // Build message metadata
      const messageData: any = {
        type: modalType,
        content,
        timestamp: Date.now(),
        is_fragmented: data.is_fragmented,
        total_shards: data.total_shards,
        threshold: data.threshold,
      };
      
      // Add geospatial data if provided or using current location
      if (data.lat !== undefined && data.long !== undefined) {
        messageData.lat = data.lat;
        messageData.long = data.long;
        messageData.radius = data.radius || 500;
      } else if (location) {
        messageData.lat = location.lat;
        messageData.long = location.long;
        messageData.radius = 500;
      }
      
      await messageService.saveMessage(messageData);
      
      const geoInfo = messageData.lat ? ' (geospatial)' : '';
      const fragInfo = data.is_fragmented ? ` (sharded ${data.threshold}/${data.total_shards})` : '';
      showToast(`${modalType} saved${geoInfo}${fragInfo}`, 'success');
    } catch (error: any) {
      showToast(`Failed to save: ${error.message}`, 'error');
    }
    setIsAlertModalOpen(false);
  };

  const handleQRScanComplete = (data: string) => {
    showToast('QR code scanned: ' + data.substring(0, 20) + '...', 'success');
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {isQRScannerOpen && (
        <QRScanner
          onScan={handleQRScanComplete}
          onClose={() => setIsQRScannerOpen(false)}
        />
      )}
      
      <AlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        onSubmit={handleAlertSubmit}
        messageType={modalType}
      />

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 animate-in fade-in duration-200"
            onClick={handleCloseMenu}
          />
          
          <div
            ref={popoverRef}
            className="fixed flex flex-col gap-2 z-[60] bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{
              top: popoverPosition?.top ? `${popoverPosition.top}px` : '0',
              left: popoverPosition?.left ? `${popoverPosition.left}px` : '0',
            }}
          >
            {/* Menu Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 mb-1">
              <span className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Actions</span>
              <button 
                onClick={handleCloseMenu}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Create Alert - Light theme */}
            <button 
              onClick={handleCreateAlert}
              className="flex items-center gap-3 px-3 py-3 text-slate-900 hover:bg-red-50 rounded-xl transition-all duration-200 text-base font-bold w-56 font-mono group/item"
            >
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center group-hover/item:scale-110 transition-transform">
                <AlertTriangle className="w-5 h-5 text-red-600" strokeWidth={2.5} />
              </div>
              <span className="tracking-tight">Create Alert</span>
            </button>
            
            {/* Scan QR - Light theme */}
            <button
              onClick={handleScanQR}
              className="flex items-center gap-3 px-3 py-3 text-slate-900 hover:bg-blue-50 rounded-xl transition-all duration-200 text-base font-bold w-56 font-mono group/item"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover/item:scale-110 transition-transform">
                <QrCode className="w-5 h-5 text-blue-600" strokeWidth={2.5} />
              </div>
              <span className="tracking-tight">Scan QR Code</span>
            </button>
            
            {/* New Message - Light theme */}
            <button
              onClick={handleCreateMessage}
              className="flex items-center gap-3 px-3 py-3 text-slate-900 hover:bg-emerald-50 rounded-xl transition-all duration-200 text-base font-bold w-56 font-mono group/item"
            >
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center group-hover/item:scale-110 transition-transform">
                <MessageSquare className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
              </div>
              <span className="tracking-tight">New Message</span>
            </button>
          </div>
        </>
      )}

      {/* FAB and Action Buttons Side Column */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-4">
        {/* Reset/Refresh Button */}
        <button
          onClick={() => window.location.reload()}
          className="w-12 h-12 bg-white/5 backdrop-blur-xl border border-white/10 text-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center transition-all hover:scale-110 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 group"
          aria-label="Refresh session"
        >
          <RotateCw className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
        </button>

        {/* Security/Shield Button */}
        <button
          className="w-12 h-12 bg-[#00ff41]/5 backdrop-blur-xl border border-[#00ff41]/20 text-[#00ff41] rounded-full shadow-[0_0_15px_rgba(0,255,65,0.1)] flex items-center justify-center transition-all hover:scale-110 hover:bg-[#00ff41]/10 hover:shadow-[0_0_20px_rgba(0,255,65,0.3)] active:scale-95 group"
          aria-label="Security status"
        >
          <ShieldAlert className="w-5 h-5 group-hover:animate-pulse" />
        </button>

        {/* FAB - Dark theme with glow */}
        {!isOpen && (
          <button
            ref={fabRef}
            onClick={() => setIsOpen(!isOpen)}
            className="w-16 h-16 bg-slate-900/40 backdrop-blur-2xl border border-white/20 text-white rounded-full shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center justify-center transition-all hover:scale-110 hover:bg-slate-800/60 hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:border-white/40 animate-in fade-in duration-300 group"
            aria-label="Add new"
            aria-expanded={isOpen}
          >
            <Plus className="w-8 h-8 transition-transform group-hover:rotate-90 duration-500" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </>
  );
}
