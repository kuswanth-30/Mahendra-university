'use client';

import { LucideIcon, Check, MapPin, Layers, Shield } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { messageService } from '@/lib/services/MessageService';

interface ContentCardProps {
  icon: LucideIcon;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  cardType?: 'alert' | 'news' | 'route' | 'default';
  id?: string;
  ciphertext?: string;
  iv?: string;
  lat?: number;
  long?: number;
  radius?: number;
  is_fragmented?: boolean;
  total_shards?: number;
  threshold?: number;
  shard_id?: number;
}

// Pill Badge Component - Modern Dark
function TypePill({ type, cardType }: { type: string; cardType: string }) {
  const pillStyles = {
    alert: 'bg-red-500/10 text-red-400 border-red-500/20',
    news: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    route: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    default: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  const style = pillStyles[cardType as keyof typeof pillStyles] || pillStyles.default;

  return (
    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-full ${style}`}>
      {type}
    </span>
  );
}

export default function ContentCard({
  icon: Icon,
  type,
  title,
  description,
  timestamp,
  cardType = 'default',
  id,
  ciphertext,
  iv,
  lat,
  long,
  radius,
  is_fragmented,
  total_shards,
  threshold,
  shard_id,
}: ContentCardProps) {
  const [displayContent, setDisplayContent] = useState({ title, description, isEncrypted: false });
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    async function decrypt() {
      if (ciphertext && iv) {
        const decrypted = await messageService.getDisplayContent({ ciphertext, iv });
        if (decrypted && decrypted.isEncrypted) {
          setDisplayContent({ 
            title: 'Encrypted Message', 
            description: '[Encrypted Content]', 
            isEncrypted: true 
          });
        } else if (decrypted) {
          setDisplayContent({ 
            title: decrypted.title || title, 
            description: decrypted.text || decrypted.description || description, 
            isEncrypted: false 
          });
        }
      }
    }
    decrypt();
  }, [ciphertext, iv, title, description]);

  const isAlert = cardType === 'alert';
  const isNews = cardType === 'news';
  const isRoute = cardType === 'route';

  // Modern theme top borders
  const topBorderClass = isAlert 
    ? 'border-t-2 border-t-red-500' 
    : isNews 
      ? 'border-t-2 border-t-cyan-500'
      : isRoute
        ? 'border-t-2 border-t-amber-500'
        : 'border-t-2 border-t-slate-700';

  // Copy to clipboard handler
  const handleCopy = useCallback(async () => {
    const textToCopy = `[${type.toUpperCase()}] ${displayContent.title}\n${displayContent.description}\n${timestamp}`;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setShowToast(true);
      
      // Hide toast after 2 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [type, title, description, timestamp]);

  return (
    <article
      onClick={handleCopy}
      className={`relative p-6 cursor-pointer vault-card group ${topBorderClass} rounded-xl overflow-hidden`}
    >
      {/* Copied! Toast - Modern Theme */}
      {showToast && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg z-10 animate-in fade-in zoom-in duration-200">
          <Check className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold text-cyan-400 tracking-tight">Copied</span>
        </div>
      )}
      <div className="flex gap-5">
        {/* Icon - Modern Theme */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${
          isAlert ? 'bg-red-500/5 border-red-500/10 group-hover:bg-red-500/10' : isNews ? 'bg-cyan-500/5 border-cyan-500/10 group-hover:bg-cyan-500/10' : isRoute ? 'bg-amber-500/5 border-amber-500/10 group-hover:bg-amber-500/10' : 'bg-slate-800 border-slate-700'
        }`}>
          <Icon
            className={`w-6 h-6 ${isAlert ? 'text-red-400' : isNews ? 'text-cyan-400' : isRoute ? 'text-amber-400' : 'text-slate-400'}`}
            strokeWidth={1.5}
          />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Meta Row with Pill */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <TypePill type={type} cardType={cardType} />
            <span className="text-slate-700 text-xs">•</span>
            <span className="text-xs text-slate-500 font-medium tracking-tight">
              {timestamp}
            </span>
            
            {/* Geospatial Badge */}
            {lat !== undefined && long !== undefined && radius !== undefined && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/5 border border-cyan-500/10 text-cyan-400/80 rounded-lg text-[10px] font-bold">
                <MapPin className="w-3 h-3" />
                {radius}m
              </span>
            )}
            
            {/* Fragmentation Badge */}
            {is_fragmented && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-[10px] font-bold">
                <Layers className="w-3 h-3" />
                {threshold}/{total_shards} SHARDS
              </span>
            )}
          </div>
          
          {/* Title - Light gray for high contrast */}
          <h3 className="text-lg font-bold leading-tight mb-2 text-slate-100 tracking-tight group-hover:text-cyan-400 transition-colors">
            {displayContent.title}
          </h3>
          
          {/* Description - Dimmer gray for body text */}
          <p className="text-sm leading-relaxed line-clamp-2 text-slate-400 font-normal">
            {displayContent.description}
          </p>
        </div>
      </div>
    </article>
  );
}
