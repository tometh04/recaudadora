'use client';

import { useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import type { Conversation } from '@/types/whatsapp';
import ChatBubble from './ChatBubble';

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('549')) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

interface ChatViewProps {
  conversation: Conversation;
}

export default function ChatView({ conversation }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when conversation changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.remoteJid, conversation.messages.length]);

  const displayName = conversation.pushName || formatPhone(conversation.phoneNumber);

  // Group messages by date
  const messagesByDate = new Map<string, typeof conversation.messages>();
  for (const msg of conversation.messages) {
    const date = new Date(msg.timestamp * 1000).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!messagesByDate.has(date)) messagesByDate.set(date, []);
    messagesByDate.get(date)!.push(msg);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900/80 shrink-0">
        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
          <User className="w-5 h-5 text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{displayName}</p>
          <p className="text-xs text-slate-500">{formatPhone(conversation.phoneNumber)}</p>
        </div>
        <div className="ml-auto text-xs text-slate-500">
          {conversation.messages.length} mensajes
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(30, 41, 59, 0.3) 0%, transparent 50%)' }}
      >
        {Array.from(messagesByDate.entries()).map(([date, msgs]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-3">
              <span className="px-3 py-1 bg-slate-800/80 rounded-full text-[11px] text-slate-400 shadow-sm">
                {date}
              </span>
            </div>
            {/* Messages */}
            {msgs.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
