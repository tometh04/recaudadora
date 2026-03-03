'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Loader2, Wifi, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { SessionInfo } from '@/types/whatsapp';

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('549')) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

interface SessionModalProps {
  demo: boolean;
  sessions: SessionInfo[];
  setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;
  onClose: () => void;
  onSessionsChanged: () => Promise<void>;
}

export default function SessionModal({ demo, sessions, setSessions, onClose, onSessionsChanged }: SessionModalProps) {
  const [sessionId, setSessionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newSession, setNewSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const handleCreate = async () => {
    if (!sessionId.trim()) return;
    setCreating(true);
    setError(null);

    if (demo) {
      const demoSession: SessionInfo = {
        id: sessionId,
        status: 'qr_ready',
        phoneNumber: null,
        name: null,
        qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        createdAt: new Date().toISOString(),
        lastMessageAt: null,
        messageCount: 0,
      };
      setNewSession(demoSession);
      setSessions(prev => [...prev, demoSession]);
      setTimeout(() => {
        const connected: SessionInfo = { ...demoSession, status: 'connected', phoneNumber: '5493415550099', name: sessionId, qrDataUrl: null };
        setNewSession(connected);
        setSessions(prev => prev.map(s => s.id === sessionId ? connected : s));
      }, 3000);
      setCreating(false);
      return;
    }

    try {
      const session = await whatsappApi.createSession(sessionId);
      setNewSession(session);
      await onSessionsChanged();

      pollRef.current = setInterval(async () => {
        try {
          const updated = await whatsappApi.getSession(sessionId);
          setNewSession(updated);
          if (updated.status === 'connected') {
            if (pollRef.current) clearInterval(pollRef.current);
            await onSessionsChanged();
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Error creando sesion');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (demo) {
      setSessions(prev => prev.filter(s => s.id !== id));
      return;
    }
    try {
      await whatsappApi.deleteSession(id);
      await onSessionsChanged();
    } catch { /* ignore */ }
  };

  const handleRestart = async (id: string) => {
    if (demo) return;
    try {
      await whatsappApi.restartSession(id);
      await onSessionsChanged();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Gestionar Sesiones</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing sessions */}
        {sessions.length > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-sm text-slate-400 font-medium">Sesiones activas</p>
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    s.status === 'connected' ? 'bg-green-400' :
                    s.status === 'qr_ready' ? 'bg-yellow-400' :
                    s.status === 'connecting' ? 'bg-blue-400 animate-pulse' :
                    'bg-red-400'
                  )} />
                  <div>
                    <p className="text-sm text-white font-medium">{s.id}</p>
                    {s.phoneNumber && <p className="text-xs text-slate-500">{formatPhone(s.phoneNumber)}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleRestart(s.id)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create new / QR flow */}
        {!newSession ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-400 font-medium">Nueva sesion</p>
            <div>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="ID de sesion (ej: oficina)"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={!sessionId.trim() || creating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition"
            >
              {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Plus className="w-4 h-4" /> Crear Sesion</>}
            </button>
          </div>
        ) : newSession.status === 'connected' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <Wifi className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-green-400">Conectado!</p>
              {newSession.phoneNumber && <p className="text-sm text-slate-400 mt-1">{formatPhone(newSession.phoneNumber)}</p>}
            </div>
            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition">
              Cerrar
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-400">Escanea el codigo QR con WhatsApp</p>
            <div className="flex justify-center p-4 bg-slate-950 rounded-xl">
              {newSession.qrDataUrl ? (
                <img src={newSession.qrDataUrl} alt="QR Code" className="w-52 h-52" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-green-400" />
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <p>1. Abre WhatsApp en tu telefono</p>
              <p>2. Toca <strong className="text-slate-300">Dispositivos vinculados</strong></p>
              <p>3. Escanea el codigo QR</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-yellow-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Esperando escaneo...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
