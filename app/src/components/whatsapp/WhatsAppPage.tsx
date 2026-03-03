'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_WA_SESSIONS, DEMO_WA_MESSAGES } from '@/lib/demo-data';
import { whatsappApi, groupByConversation } from '@/lib/whatsapp-api';
import type { SessionInfo, WhatsAppMessage, Conversation } from '@/types/whatsapp';

import WhatsAppHeader from './WhatsAppHeader';
import ConversationList from './ConversationList';
import ChatView from './ChatView';
import EmptyChatState from './EmptyChatState';
import SessionModal from './SessionModal';

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);

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
      return;
    }
    try {
      const data = await whatsappApi.getMessages({ limit: 500 });
      setMessages(data.messages);
    } catch {
      // Server offline
    }
  }, [demo]);

  // Group messages into conversations whenever messages change
  useEffect(() => {
    const convs = groupByConversation(messages);
    setConversations(convs);

    // Auto-select first conversation if none is selected
    if (!selectedJid && convs.length > 0) {
      setSelectedJid(convs[0].remoteJid);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadSessions(), loadMessages()]);
      setLoading(false);
    };
    load();
  }, [loadSessions, loadMessages]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (demo) return;
    const interval = setInterval(() => {
      loadSessions();
      loadMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [demo, loadSessions, loadMessages]);

  // ============================================================
  // Selected conversation
  // ============================================================

  const selectedConversation = conversations.find(c => c.remoteJid === selectedJid) || null;

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-2rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <WhatsAppHeader
        sessions={sessions}
        serverOnline={serverOnline}
        onManageSessions={() => setShowSessionModal(true)}
      />

      {/* Main content: 2-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Conversation list */}
        <div className="w-80 border-r border-slate-800 shrink-0 bg-slate-900/50 overflow-hidden">
          <ConversationList
            conversations={conversations}
            selectedJid={selectedJid}
            onSelect={setSelectedJid}
          />
        </div>

        {/* Right panel: Chat view */}
        <div className="flex-1 bg-slate-950 overflow-hidden">
          {selectedConversation ? (
            <ChatView conversation={selectedConversation} />
          ) : (
            <EmptyChatState />
          )}
        </div>
      </div>

      {/* Session management modal */}
      {showSessionModal && (
        <SessionModal
          demo={demo}
          sessions={sessions}
          setSessions={setSessions}
          onClose={() => setShowSessionModal(false)}
          onSessionsChanged={async () => {
            await loadSessions();
          }}
        />
      )}
    </div>
  );
}
