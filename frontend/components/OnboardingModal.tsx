'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Shield, 
  Key, 
  Zap, 
  Scan, 
  ChevronRight, 
  ChevronLeft, 
  X,
  Lock,
  Globe,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ONBOARDING_KEY = 'vaultmesh_onboarding_complete';

interface Slide {
  id: number;
  title: string;
  heading: string;
  body: string;
  icon: React.ElementType;
  accent: string;
  labels: string[];
}

const slides: Slide[] = [
  {
    id: 1,
    title: 'Welcome to VaultMesh',
    heading: 'Entering the Mesh',
    body: 'VaultMesh is a decentralized, secure communication network. Your data stays on your device and travels peer-to-peer, bypassing central servers.',
    icon: Globe,
    accent: 'text-blue-400',
    labels: ['DECENTRALIZED', 'P2P_ONLY', 'ZERO_TRUST']
  },
  {
    id: 2,
    title: 'Ephemeral Identity',
    heading: 'Security Protocols',
    body: 'Your identity is cryptographic. Upon entry, an Ed25519 key pair is generated. These keys can be rotated regularly to ensure maximum privacy.',
    icon: Key,
    accent: 'text-[#00ff41]',
    labels: ['ED25519_ACTIVE', 'KEY_ROTATION_READY', 'AES_GCM']
  },
  {
    id: 3,
    title: 'Transport & Routing',
    heading: 'Active Nodes',
    body: 'Your connection is forged through local discovery. If direct P2P connection fails, the network utilizes authorized Circuit Relay nodes to bridge the gap.',
    icon: Radio,
    accent: 'text-amber-400',
    labels: ['LOCAL_DISCOVERY', 'RELAY_BRIDGE', 'DHT_SYNC']
  },
  {
    id: 4,
    title: 'QR Dead Drops',
    heading: 'Offline Secure Messaging',
    body: 'Encode secure, ephemeral messages into QR codes. These can be scanned and decoded offline by other users, creating a tamper-proof "dead drop" system.',
    icon: Scan,
    accent: 'text-purple-400',
    labels: ['OFFLINE_READY', 'TAMPER_PROOF', 'ONE_TIME_PAD']
  }
];

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isComplete = localStorage.getItem(ONBOARDING_KEY);
    if (!isComplete) {
      setIsOpen(true);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOpen(false);
  };

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  };

  if (!mounted || !isOpen) return null;

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 font-mono">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col md:flex-row h-[600px] md:h-[450px]">
        
        {/* Progress Bar (Top) */}
        <div className="absolute top-0 left-0 right-0 h-1 flex">
          {slides.map((_, idx) => (
            <div 
              key={idx}
              className={cn(
                "h-full flex-1 transition-all duration-500",
                idx <= currentSlide ? "bg-[#00ff41]" : "bg-white/5"
              )}
            />
          ))}
        </div>

        {/* Skip Button */}
        <button 
          onClick={handleComplete}
          className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest z-10"
        >
          Skip Onboarding
        </button>

        {/* Left Side: Visual/Icon */}
        <div className="w-full md:w-2/5 bg-black/40 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-white/5 relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00ff41]/5 to-transparent opacity-50" />
          <div className={cn(
            "w-24 h-24 rounded-full bg-slate-900/50 border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_30px_rgba(0,0,0,0.5)]",
            slide.accent.replace('text', 'border-t')
          )}>
            <Icon className={cn("w-10 h-10 animate-pulse", slide.accent)} />
          </div>
          <div className="flex flex-wrap justify-center gap-2 relative z-10">
            {slide.labels.map(label => (
              <span key={label} className="text-[8px] font-black text-slate-500 border border-white/5 px-2 py-1 rounded bg-black/20 tracking-tighter">
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Right Side: Content */}
        <div className="w-full md:w-3/5 p-8 md:p-12 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] text-[#00ff41] font-black uppercase tracking-[0.3em] opacity-80">
                MODULE_{slide.id.toString().padStart(2, '0')}
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] leading-none">
                {slide.heading}
              </h1>
            </div>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed font-sans">
              {slide.body}
            </p>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between mt-8">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="w-10 h-10 rounded-full border border-white/5 hover:bg-white/5 disabled:opacity-20 text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="flex items-center text-[10px] text-slate-600 px-2 uppercase font-black">
                {currentSlide + 1} / {slides.length}
              </span>
            </div>

            {currentSlide === slides.length - 1 ? (
              <Button 
                onClick={handleComplete}
                className="bg-[#00ff41] hover:bg-[#00ff41]/90 text-black font-black text-xs uppercase tracking-widest px-8 h-12 rounded-xl shadow-[0_0_20px_rgba(0,255,65,0.3)] active:scale-95 transition-all"
              >
                Initialize My Vault
              </Button>
            ) : (
              <Button 
                onClick={nextSlide}
                className="bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-widest px-8 h-12 rounded-xl border border-white/5 active:scale-95 transition-all flex items-center gap-2"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
