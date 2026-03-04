'use client';

import { useEffect } from 'react';
import { useAppStore, type Toast } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  GitCompareArrows,
  X,
} from 'lucide-react';
import { timeAgo } from '@/lib/utils';

const TOAST_ICONS: Record<Toast['type'], React.ElementType> = {
  nuevo_comprobante: Inbox,
  verificado: CheckCircle2,
  rechazado: XCircle,
  conciliado: GitCompareArrows,
};

const TOAST_COLORS: Record<Toast['type'], string> = {
  nuevo_comprobante: 'border-blue-500/50 bg-blue-500/5',
  verificado: 'border-green-500/50 bg-green-500/5',
  rechazado: 'border-red-500/50 bg-red-500/5',
  conciliado: 'border-purple-500/50 bg-purple-500/5',
};

const TOAST_ICON_COLORS: Record<Toast['type'], string> = {
  nuevo_comprobante: 'text-blue-400',
  verificado: 'text-green-400',
  rechazado: 'text-red-400',
  conciliado: 'text-purple-400',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const router = useRouter();
  const Icon = TOAST_ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg cursor-pointer transition-all duration-300 hover:scale-[1.02] ${TOAST_COLORS[toast.type]}`}
      onClick={() => {
        if (toast.href) router.push(toast.href);
        onDismiss();
      }}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${TOAST_ICON_COLORS[toast.type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug">{toast.text}</p>
        <p className="text-xs text-slate-500 mt-0.5">{timeAgo(toast.timestamp)}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-slate-500 hover:text-white transition shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { notifications, removeNotification } = useAppStore();

  // Show max 5 most recent
  const visible = notifications.slice(-5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80">
      {visible.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeNotification(toast.id)}
        />
      ))}
    </div>
  );
}
