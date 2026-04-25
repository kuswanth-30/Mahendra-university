'use client';

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Send, AlertCircle, MapPin, Layers } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { 
    title: string; 
    message: string; 
    priority: string;
    lat?: number;
    long?: number;
    radius?: number;
    is_fragmented?: boolean;
    total_shards?: number;
    threshold?: number;
  }) => void;
  messageType?: 'Alert' | 'News';
}

export default function AlertModal({ isOpen, onClose, onSubmit, messageType = 'Alert' }: AlertModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('high');
  const [errors, setErrors] = useState<{ title?: string; message?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Geospatial fields
  const [useGeospatial, setUseGeospatial] = useState(false);
  const [lat, setLat] = useState('');
  const [long, setLong] = useState('');
  const [radius, setRadius] = useState('500');
  
  // Fragmentation fields
  const [useFragmentation, setUseFragmentation] = useState(false);
  const [totalShards, setTotalShards] = useState(3);
  const [threshold, setThreshold] = useState(2);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setMessage('');
      setPriority(messageType === 'Alert' ? 'high' : 'normal');
      setErrors({});
      setIsSubmitting(false);
      setUseGeospatial(false);
      setLat('');
      setLong('');
      setRadius('500');
      setUseFragmentation(false);
      setTotalShards(3);
      setThreshold(2);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const validate = (): boolean => {
    const newErrors: { title?: string; message?: string } = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    } else if (title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    
    if (!message.trim()) {
      newErrors.message = 'Message is required';
    } else if (message.length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onSubmit({ 
      title: title.trim(), 
      message: message.trim(), 
      priority,
      ...(useGeospatial ? {
        lat: parseFloat(lat),
        long: parseFloat(long),
        radius: parseInt(radius),
      } : {}),
      ...(useFragmentation ? {
        is_fragmented: true,
        total_shards: totalShards,
        threshold: threshold,
      } : {}),
    });
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 id="alert-modal-title" className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">
                {messageType === 'Alert' ? 'Broadcast Alert' : 'New Message'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
              aria-label="Cancel and close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Priority Selection */}
            {messageType === 'Alert' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">
                Priority Level
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'critical', label: 'CRITICAL', color: 'bg-red-50 text-red-700 border-red-200 shadow-sm' },
                  { value: 'high', label: 'HIGH', color: 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' },
                  { value: 'medium', label: 'MEDIUM', color: 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' },
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`flex-1 py-2.5 text-[10px] font-bold font-mono border rounded-lg transition-all ${
                      priority === p.value 
                        ? p.color 
                        : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Title Input */}
            <div>
              <label htmlFor="alert-title" className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">
                {messageType === 'Alert' ? 'Alert Title' : 'Message Title'}
              </label>
              <input
                id="alert-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors({ ...errors, title: undefined });
                }}
                placeholder={messageType === 'Alert' ? "e.g., Checkpoint at Main St" : "e.g., Community Update"}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono font-bold ${
                  errors.title ? 'border-red-300 bg-red-50/50' : 'border-slate-100'
                }`}
                maxLength={60}
              />
              {errors.title && (
                <div className="flex items-center gap-1.5 mt-2">
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] font-bold text-red-600 font-mono">{errors.title}</span>
                </div>
              )}
            </div>

            {/* Message Input */}
            <div>
              <label htmlFor="alert-message" className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">
                Message Details
              </label>
              <textarea
                id="alert-message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (errors.message) setErrors({ ...errors, message: undefined });
                }}
                placeholder="Provide clear, actionable information..."
                rows={4}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-lg text-sm text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none font-mono ${
                  errors.message ? 'border-red-300 bg-red-50/50' : 'border-slate-100'
                }`}
                maxLength={280}
              />
              <div className="flex justify-between mt-2">
                {errors.message ? (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    <span className="text-[10px] font-bold text-red-600 font-mono">{errors.message}</span>
                  </div>
                ) : <div />}
                <span className="text-[10px] font-bold text-slate-400 font-mono">{message.length}/280</span>
              </div>
            </div>

            {/* Geospatial Toggle */}
            <div className="border border-slate-100 rounded-lg p-3">
              <button
                type="button"
                onClick={() => setUseGeospatial(!useGeospatial)}
                className="flex items-center gap-2 w-full text-left"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  useGeospatial ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                }`}>
                  {useGeospatial && <MapPin className="w-3 h-3 text-white" />}
                </div>
                <span className="text-xs font-bold font-mono text-slate-700">Geospatial Filter</span>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">Only propagate within radius</span>
              </button>
              
              {useGeospatial && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={long}
                      onChange={(e) => setLong(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono">Radius (m)</label>
                    <input
                      type="number"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                      placeholder="500"
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Fragmentation Toggle */}
            <div className="border border-slate-100 rounded-lg p-3">
              <button
                type="button"
                onClick={() => setUseFragmentation(!useFragmentation)}
                className="flex items-center gap-2 w-full text-left"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  useFragmentation ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                }`}>
                  {useFragmentation && <Layers className="w-3 h-3 text-white" />}
                </div>
                <span className="text-xs font-bold font-mono text-slate-700">Shamir Secret Sharing</span>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">Split into encrypted shards</span>
              </button>
              
              {useFragmentation && (
                <div className="flex items-center gap-4 mt-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono block">Total Shards (n)</label>
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={totalShards}
                      onChange={(e) => setTotalShards(Number(e.target.value))}
                      className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono block">Threshold (k)</label>
                    <input
                      type="number"
                      min={2}
                      max={totalShards}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-4">
                    Need {threshold} of {totalShards} shards to reconstruct
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-white hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-lg transition-colors border border-slate-200 uppercase tracking-widest font-mono"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex-1 px-4 py-3 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest font-mono shadow-md ${
                  messageType === 'Alert' 
                    ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 shadow-red-200' 
                    : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 shadow-emerald-200'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{messageType === 'Alert' ? 'Broadcast' : 'Send Message'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
