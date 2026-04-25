'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, AlertTriangle, QrCode, X, MessageSquare } from 'lucide-react';
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
            className="fixed inset-0 bg-black/20 z-40"
            onClick={handleCloseMenu}
          />
          
          <div
            ref={popoverRef}
            className="fixed flex flex-col gap-2 z-50 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl"
            style={{
              top: popoverPosition?.top ? `${popoverPosition.top}px` : '0',
              left: popoverPosition?.left ? `${popoverPosition.left}px` : '0',
            }}
          >
            {/* Menu Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 mb-1">
              <span className="text-xs font-semibold text-slate-600 font-mono">Actions</span>
              <button 
                onClick={handleCloseMenu}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Create Alert - Light theme */}
            <button 
              onClick={handleCreateAlert}
              className="flex items-center gap-3 px-3 py-3 text-slate-700 hover:bg-red-50 hover:text-slate-900 rounded-xl transition-colors text-sm font-medium w-48 font-mono"
            >
              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <span>Create Alert</span>
            </button>
            
            {/* Scan QR - Light theme */}
            <button
              onClick={handleScanQR}
              className="flex items-center gap-3 px-3 py-3 text-slate-700 hover:bg-blue-50 hover:text-slate-900 rounded-xl transition-colors text-sm font-medium w-48 font-mono"
            >
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <QrCode className="w-4 h-4 text-blue-500" />
              </div>
              <span>Scan QR Code</span>
            </button>
            
            {/* New Message - Light theme */}
            <button
              onClick={handleCreateMessage}
              className="flex items-center gap-3 px-3 py-3 text-slate-700 hover:bg-emerald-50 hover:text-slate-900 rounded-xl transition-colors text-sm font-medium w-48 font-mono"
            >
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-emerald-500" />
              </div>
              <span>New Message</span>
            </button>
          </div>
        </>
      )}

      {/* FAB - Light theme */}
      <button
        ref={fabRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all ${
          isOpen ? 'rotate-45 bg-red-500 hover:bg-red-600' : 'hover:scale-110'
        }`}
        aria-label={isOpen ? 'Close menu' : 'Add new'}
        aria-expanded={isOpen}
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
      </button>
    </>
  );
}
