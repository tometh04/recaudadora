'use client';

import { cn } from '@/lib/utils';
import { User, Image as ImageIcon, FileText, Mic, Video } from 'lucide-react';
import type { Conversation } from '@/types/whatsapp';

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('549')) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

function timeAgo(ts: number): string {
  const now = Date.now();
  const msgTime = ts * 1000;
  const diff = now - msgTime;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(msgTime).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function getLastMessagePreview(conv: Conversation): { icon: typeof ImageIcon | null; text: string } {
  const msg = conv.lastMessage;
  switch (msg.messageType) {
    case 'image':
      return { icon: ImageIcon, text: 'Imagen' };
    case 'video':
      return { icon: Video, text: 'Video' };
    case 'document':
      return { icon: FileText, text: 'Documento' };
    case 'audio':
      return { icon: Mic, text: 'Audio' };
    case 'text':
    default:
      return { icon: null, text: msg.textContent || '...' };
  }
}

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export default function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const displayName = conversation.pushName || formatPhone(conversation.phoneNumber);
  const preview = getLastMessagePreview(conversation);
  const PreviewIcon = preview.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-800/50',
        isSelected
          ? 'bg-slate-800/60'
          : 'hover:bg-slate-800/30'
      )}
    >
      {/* Avatar */}
      <div className="w-11 h-11 bg-slate-700 rounded-full flex items-center justify-center shrink-0">
        <User className="w-5 h-5 text-slate-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          <span className="text-[11px] text-slate-500 shrink-0 ml-2">
            {timeAgo(conversation.lastMessage.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {conversation.lastMessage.fromMe && (
            <span className="text-xs text-slate-500 shrink-0">Tu:</span>
          )}
          {PreviewIcon && (
            <PreviewIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <p className="text-xs text-slate-400 truncate">{preview.text}</p>
        </div>
      </div>
    </button>
  );
}
