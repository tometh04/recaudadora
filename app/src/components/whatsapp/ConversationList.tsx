'use client';

import { useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import type { Conversation } from '@/types/whatsapp';
import ConversationItem from './ConversationItem';

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('549')) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedJid: string | null;
  onSelect: (jid: string) => void;
}

export default function ConversationList({ conversations, selectedJid, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.pushName && c.pushName.toLowerCase().includes(q)) ||
      c.phoneNumber.includes(q) ||
      formatPhone(c.phoneNumber).includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar conversacion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">
              {conversations.length === 0
                ? 'No hay conversaciones'
                : 'Sin resultados'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.remoteJid}
              conversation={conv}
              isSelected={selectedJid === conv.remoteJid}
              onClick={() => onSelect(conv.remoteJid)}
            />
          ))
        )}
      </div>
    </div>
  );
}
