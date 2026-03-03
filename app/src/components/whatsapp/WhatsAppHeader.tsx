'use client';

import { cn } from '@/lib/utils';
import { QrCode, Settings, Wifi, WifiOff } from 'lucide-react';
import type { SessionInfo } from '@/types/whatsapp';

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('549')) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

interface WhatsAppHeaderProps {
  sessions: SessionInfo[];
  serverOnline: boolean | null;
  onManageSessions: () => void;
}

export default function WhatsAppHeader({ sessions, serverOnline, onManageSessions }: WhatsAppHeaderProps) {
  const connectedSession = sessions.find(s => s.status === 'connected');
  const hasAnySession = sessions.length > 0;

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-3">
        {/* Connection dot */}
        <div className={cn(
          'w-2.5 h-2.5 rounded-full shrink-0',
          connectedSession ? 'bg-green-400' :
          hasAnySession ? 'bg-yellow-400 animate-pulse' :
          'bg-slate-600'
        )} />

        {/* Session info */}
        {connectedSession ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">WhatsApp</span>
              {connectedSession.name && (
                <span className="text-slate-400 text-sm">
                  &middot; {connectedSession.name}
                </span>
              )}
            </div>
            {connectedSession.phoneNumber && (
              <p className="text-xs text-slate-500">{formatPhone(connectedSession.phoneNumber)}</p>
            )}
          </div>
        ) : (
          <div>
            <span className="text-white font-semibold text-sm">WhatsApp</span>
            <p className="text-xs text-slate-500">
              {hasAnySession ? 'Conectando...' : 'Sin sesion'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Server status */}
        {serverOnline !== null && (
          <span className={cn(
            'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border',
            serverOnline
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          )}>
            {serverOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {serverOnline ? 'Online' : 'Offline'}
          </span>
        )}

        {/* Connect / Manage button */}
        {connectedSession ? (
          <button
            onClick={onManageSessions}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Gestionar sesiones"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        ) : (
          <button
            onClick={onManageSessions}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition"
          >
            <QrCode className="w-4 h-4" />
            Conectar WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}
