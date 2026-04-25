'use client';

import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import type { ToastType } from '@/hooks/useToast';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    iconColor: 'text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    iconColor: 'text-amber-400',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    iconColor: 'text-blue-400',
  },
};

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const config = toastConfig[toast.type];
        const Icon = config.icon;
        
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm animate-in slide-in-from-right ${config.bgColor} ${config.borderColor}`}
            role="alert"
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
            <p className={`text-sm flex-1 ${config.textColor}`}>{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className={`w-4 h-4 ${config.textColor}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
