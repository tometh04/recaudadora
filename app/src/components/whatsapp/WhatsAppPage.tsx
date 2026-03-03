'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Wifi,
  WifiOff,
  QrCode,
  Loader2,
  Trash2,
  RotateCcw,
  Search,
  Image,
  FileText,
  Mic,
  Video,
  Sticker,
  File,
  X,
  Phone,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_WA_SESSIONS, DEMO_WA_MESSAGES } from '@/lib/demo-data';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { SessionInfo, WhatsAppMessage, WAMessageType } from '@/types/whatsapp';

// ============================================================
// Status helpers
// ============================================================

const STATUS_BADGES: Record<string, { label: string; color: string; icon: typeof Wifi }> = {
  connected: { label: 'Conectado', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: Wifi },
  qr_ready: { label: 'Escanear QR', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: QrCode },
  connecting: { label: 'Conectando...', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Loader2 },
  disconnected: { label: 'Desconectado', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: WifiOff },
};

const MSG_TYPE_ICONS: Record<WAMessageType, typeof Image> = {
  text: MessageSquare,
  image: Image,
  video: Video,
  document: FileText,
  audio: Mic,
  sticker: Sticker,
  other: File,
};

const MSG_TYPE_LABELS: Record<WAMessageType, string> = {
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  document: 'Documento',
  audio: 'Audio',
  sticker: 'Sticker',
  other: 'Otro',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-AR');
}

function formatPhone(phone: string): string {
  if (phone.length >= 10) {
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('549')) {
      return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
    }
    return `+${clean}`;
  }
  return phone;
}

// ============================================================
// Main Component
// ============================================================

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<'sessions' | 'messages'>('sessions');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Modals
  const [showNewSession, setShowNewSession] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);

  const demo = isDemoMode();

  // ============================================================
  // Data loading
  // ============================================================

  const loadSessions = useCallback(async () => {
    if (demo) {
      setSessions(DEMO_WA_SESSIONS);
      setServerOnline(true);
      return;
    }
    try {
      const data = await whatsappApi.getSessions();
      setSessions(data);
      setServerOnline(true);
    } catch {
      setServerOnline(false);
    }
  }, [demo]);

  const loadMessages = useCallback(async () => {
    if (demo) {
      setMessages(DEMO_WA_MESSAGES);
      setTotalMessages(DEMO_WA_MESSAGES.length);
      return;
    }
    try {
      const params: Record<string, any> = { limit: 100 };
      if (sessionFilter !== 'all') params.sessionId = sessionFilter;
      const data = await whatsappApi.getMessages(params);
      setMessages(data.messages);
      setTotalMessages(data.total);
    } catch {
      // Server offline
    }
  }, [demo, sessionFilter]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadSessions(), loadMessages()]);
      setLoading(false);
    };
    load();
  }, [loadSessions, loadMessages]);

  // Auto-refresh (every 5s for messages, 3s for sessions if QR is being scanned)
  useEffect(() => {
    if (demo) return;
    const interval = setInterval(() => {
      loadSessions();
      if (activeTab === 'messages') loadMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [demo, activeTab, loadSessions, loadMessages]);

  // ============================================================
  // Session actions
  // ============================================================

  const handleDeleteSession = async (id: string) => {
    if (demo) {
      setSessions(prev => prev.filter(s => s.id !== id));
      return;
    }
    try {
      await whatsappApi.deleteSession(id);
      await loadSessions();
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const handleRestartSession = async (id: string) => {
    if (demo) return;
    try {
      await whatsappApi.restartSession(id);
      await loadSessions();
    } catch (err) {
      console.error('Error restarting session:', err);
    }
  };

  // ============================================================
  // Filtering
  // ============================================================

  const filteredMessages = messages.filter((msg) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      msg.phoneNumber.includes(q) ||
      (msg.pushName && msg.pushName.toLowerCase().includes(q)) ||
      (msg.textContent && msg.textContent.toLowerCase().includes(q)) ||
      msg.sessionId.toLowerCase().includes(q)
    );
  });

  const connectedCount = sessions.filter(s => s.status === 'connected').length;

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-green-500/10 rounded-xl">
            <MessageSquare className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
            <p className="text-sm text-slate-400">
              {connectedCount} {connectedCount === 1 ? 'sesion conectada' : 'sesiones conectadas'} &middot; {totalMessages} mensajes
            </p>
          </div>
        </div>

        {/* Server status */}
        <div className="flex items-center gap-3">
          {serverOnline !== null && (
            <span className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
              serverOnline
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', serverOnline ? 'bg-green-400' : 'bg-red-400')} />
              {serverOnline ? 'Server Online' : 'Server Offline'}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800 w-fit">
        <button
          onClick={() => setActiveTab('sessions')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
            activeTab === 'sessions'
              ? 'bg-green-600/20 text-green-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <QrCode className="w-4 h-4" />
          Sesiones ({sessions.length})
        </button>
        <button
          onClick={() => { setActiveTab('messages'); loadMessages(); }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
            activeTab === 'messages'
              ? 'bg-green-600/20 text-green-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <MessageSquare className="w-4 h-4" />
          Mensajes ({totalMessages})
        </button>
      </div>

      {/* ============================================================ */}
      {/* Tab: Sessions */}
      {/* ============================================================ */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">
              Conecta numeros de WhatsApp escaneando el codigo QR
            </p>
            <button
              onClick={() => setShowNewSession(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Nueva Sesion
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
              <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">No hay sesiones conectadas</p>
              <p className="text-slate-500 text-sm">Crea una nueva sesion para comenzar a recibir mensajes</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onDelete={handleDeleteSession}
                  onRestart={handleRestartSession}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Tab: Messages */}
      {/* ============================================================ */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por telefono, nombre, contenido..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50"
              />
            </div>

            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
            >
              <option value="all">Todas las sesiones</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id} {s.phoneNumber ? `(${s.phoneNumber})` : ''}
                </option>
              ))}
            </select>

            <button
              onClick={loadMessages}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Refrescar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Messages table */}
          {filteredMessages.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
              <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">No hay mensajes</p>
              <p className="text-slate-500 text-sm">
                {messages.length === 0
                  ? 'Los mensajes apareceran cuando alguien escriba a un numero conectado'
                  : 'No se encontraron mensajes con los filtros actuales'}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Remitente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sesion</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contenido</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredMessages.map((msg) => {
                      const TypeIcon = MSG_TYPE_ICONS[msg.messageType];
                      return (
                        <tr
                          key={msg.id}
                          onClick={() => setSelectedMessage(msg)}
                          className="hover:bg-slate-800/30 cursor-pointer transition"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {msg.fromMe ? (
                                <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              ) : (
                                <ArrowLeft className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              )}
                              <div>
                                <p className="text-sm text-white font-medium">
                                  {msg.pushName || formatPhone(msg.phoneNumber)}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {formatPhone(msg.phoneNumber)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {msg.sessionId}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <TypeIcon className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs text-slate-400">
                                {MSG_TYPE_LABELS[msg.messageType]}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-slate-300 truncate max-w-xs">
                              {msg.textContent || (
                                <span className="text-slate-500 italic">
                                  {MSG_TYPE_LABELS[msg.messageType]}
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                            {timeAgo(msg.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal: New Session */}
      {/* ============================================================ */}
      {showNewSession && (
        <NewSessionModal
          demo={demo}
          onClose={() => setShowNewSession(false)}
          onCreated={async () => {
            await loadSessions();
          }}
          sessions={sessions}
          setSessions={setSessions}
        />
      )}

      {/* ============================================================ */}
      {/* Modal: Message Detail */}
      {/* ============================================================ */}
      {selectedMessage && (
        <MessageDetailModal
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Session Card Component
// ============================================================

function SessionCard({
  session,
  onDelete,
  onRestart,
}: {
  session: SessionInfo;
  onDelete: (id: string) => void;
  onRestart: (id: string) => void;
}) {
  const badge = STATUS_BADGES[session.status] || STATUS_BADGES.disconnected;
  const BadgeIcon = badge.icon;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-white font-semibold">{session.id}</h3>
          {session.name && (
            <p className="text-sm text-slate-400">{session.name}</p>
          )}
        </div>
        <span className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
          badge.color
        )}>
          <BadgeIcon className={cn('w-3 h-3', session.status === 'connecting' && 'animate-spin')} />
          {badge.label}
        </span>
      </div>

      {session.phoneNumber && (
        <div className="flex items-center gap-2 mb-3">
          <Phone className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm text-slate-300">{formatPhone(session.phoneNumber)}</span>
        </div>
      )}

      {session.status === 'qr_ready' && session.qrDataUrl && (
        <div className="mb-3 flex justify-center p-3 bg-slate-950 rounded-lg">
          <img src={session.qrDataUrl} alt="QR Code" className="w-48 h-48" />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{session.messageCount} mensajes</span>
        {session.lastMessageAt && <span>{timeAgo(session.lastMessageAt)}</span>}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={() => onRestart(session.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reconectar
        </button>
        <button
          onClick={() => onDelete(session.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Eliminar
        </button>
      </div>
    </div>
  );
}

// ============================================================
// New Session Modal
// ============================================================

function NewSessionModal({
  demo,
  onClose,
  onCreated,
  sessions,
  setSessions,
}: {
  demo: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  sessions: SessionInfo[];
  setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;
}) {
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

      // Simulate connection after 3 seconds
      setTimeout(() => {
        const connected: SessionInfo = {
          ...demoSession,
          status: 'connected',
          phoneNumber: '5493415550099',
          name: sessionId,
          qrDataUrl: null,
        };
        setNewSession(connected);
        setSessions(prev => prev.map(s => s.id === sessionId ? connected : s));
      }, 3000);

      setCreating(false);
      return;
    }

    try {
      const session = await whatsappApi.createSession(sessionId);
      setNewSession(session);
      await onCreated();

      // Start polling for QR / connection status
      pollRef.current = setInterval(async () => {
        try {
          const updated = await whatsappApi.getSession(sessionId);
          setNewSession(updated);

          if (updated.status === 'connected') {
            if (pollRef.current) clearInterval(pollRef.current);
            await onCreated();
          }
        } catch {
          // Ignore poll errors
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Error creando sesion');
    }

    setCreating(false);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Nueva Sesion WhatsApp</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!newSession ? (
          // Step 1: Enter session ID
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">
                ID de Sesion
              </label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="ej: oficina-centro"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <p className="text-xs text-slate-500 mt-1">Solo letras, numeros, guiones y guiones bajos</p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={!sessionId.trim() || creating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Crear Sesion
                </>
              )}
            </button>
          </div>
        ) : newSession.status === 'connected' ? (
          // Step 3: Connected!
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <Wifi className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-green-400">Conectado!</p>
              {newSession.phoneNumber && (
                <p className="text-sm text-slate-400 mt-1">
                  {formatPhone(newSession.phoneNumber)}
                </p>
              )}
              {newSession.name && (
                <p className="text-sm text-slate-500">{newSession.name}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition"
            >
              Cerrar
            </button>
          </div>
        ) : (
          // Step 2: Show QR Code
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-400">
              Escanea este codigo QR con WhatsApp en tu telefono
            </p>

            <div className="flex justify-center p-4 bg-slate-950 rounded-xl">
              {newSession.qrDataUrl ? (
                <img src={newSession.qrDataUrl} alt="QR Code" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-green-400" />
                </div>
              )}
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>1. Abre WhatsApp en tu telefono</p>
              <p>2. Toca <strong className="text-slate-300">Dispositivos vinculados</strong></p>
              <p>3. Toca <strong className="text-slate-300">Vincular un dispositivo</strong></p>
              <p>4. Escanea el codigo QR</p>
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

// ============================================================
// Message Detail Modal
// ============================================================

function MessageDetailModal({
  message,
  onClose,
}: {
  message: WhatsAppMessage;
  onClose: () => void;
}) {
  const TypeIcon = MSG_TYPE_ICONS[message.messageType];
  const mediaUrl = message.mediaUrl ? whatsappApi.getMediaUrl(message.mediaUrl) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Detalle del Mensaje</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Sender info */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              message.fromMe ? 'bg-blue-500/10' : 'bg-green-500/10'
            )}>
              {message.fromMe ? (
                <ArrowRight className="w-5 h-5 text-blue-400" />
              ) : (
                <ArrowLeft className="w-5 h-5 text-green-400" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">
                {message.fromMe ? 'Enviado' : (message.pushName || formatPhone(message.phoneNumber))}
              </p>
              <p className="text-sm text-slate-400">{formatPhone(message.phoneNumber)}</p>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Sesion</p>
              <p className="text-sm text-white">{message.sessionId}</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Tipo</p>
              <div className="flex items-center gap-1.5">
                <TypeIcon className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-sm text-white">{MSG_TYPE_LABELS[message.messageType]}</p>
              </div>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Fecha</p>
              <p className="text-sm text-white">
                {new Date(message.createdAt).toLocaleString('es-AR')}
              </p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">JID</p>
              <p className="text-sm text-white truncate" title={message.remoteJid}>
                {message.remoteJid}
              </p>
            </div>
          </div>

          {/* Media preview */}
          {mediaUrl && message.messageType === 'image' && (
            <div className="rounded-xl overflow-hidden border border-slate-800">
              <img src={mediaUrl} alt="Media" className="w-full" />
            </div>
          )}

          {mediaUrl && message.messageType !== 'image' && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl text-green-400 hover:text-green-300 transition"
            >
              <FileText className="w-5 h-5" />
              <span className="text-sm">Descargar {MSG_TYPE_LABELS[message.messageType]}</span>
            </a>
          )}

          {/* Text content */}
          {message.textContent && (
            <div className="p-4 bg-slate-800/30 rounded-xl">
              <p className="text-xs text-slate-500 mb-1.5">Contenido</p>
              <p className="text-sm text-white whitespace-pre-wrap">{message.textContent}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
