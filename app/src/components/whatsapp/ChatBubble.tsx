'use client';

import { cn } from '@/lib/utils';
import { FileText, DollarSign, Image as ImageIcon } from 'lucide-react';
import type { WhatsAppMessage } from '@/types/whatsapp';
import { whatsappApi } from '@/lib/whatsapp-api';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

interface ChatBubbleProps {
  message: WhatsAppMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isOutgoing = message.fromMe;
  const mediaUrl = message.mediaUrl ? whatsappApi.getMediaUrl(message.mediaUrl) : null;
  const isMedia = message.messageType === 'image' || message.messageType === 'video';
  const isDocument = message.messageType === 'document';
  const isIncomingMedia = !isOutgoing && (isMedia || isDocument);

  return (
    <div
      className={cn(
        'flex mb-1.5',
        isOutgoing ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[75%] px-3 py-2 rounded-2xl shadow-sm',
          isOutgoing
            ? 'bg-green-600/20 text-slate-100 rounded-tr-sm'
            : 'bg-slate-800/80 text-slate-100 rounded-tl-sm'
        )}
      >
        {/* Media preview */}
        {mediaUrl && isMedia && (
          <div className="relative mb-1.5 -mx-1 -mt-0.5">
            <img
              src={mediaUrl}
              alt=""
              className="w-full max-w-[280px] rounded-xl object-cover"
              loading="lazy"
            />
            {isIncomingMedia && (
              <span className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                <DollarSign className="w-3.5 h-3.5 text-white" />
              </span>
            )}
          </div>
        )}

        {/* Document card */}
        {isDocument && (
          <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg mb-1.5 relative">
            <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200 truncate">
                {message.textContent || 'Documento'}
              </p>
              <p className="text-xs text-slate-500">
                {message.mimeType || 'application/pdf'}
              </p>
            </div>
            {isIncomingMedia && (
              <span className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                <DollarSign className="w-3 h-3 text-white" />
              </span>
            )}
          </div>
        )}

        {/* Text content */}
        {message.textContent && !isDocument && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.textContent}
          </p>
        )}

        {/* No content fallback */}
        {!message.textContent && !isMedia && !isDocument && (
          <p className="text-sm text-slate-400 italic">
            {message.messageType === 'audio' ? 'Audio' :
             message.messageType === 'sticker' ? 'Sticker' :
             message.messageType}
          </p>
        )}

        {/* Timestamp */}
        <p
          className={cn(
            'text-[10px] mt-1 text-right',
            isOutgoing ? 'text-green-400/50' : 'text-slate-500'
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
