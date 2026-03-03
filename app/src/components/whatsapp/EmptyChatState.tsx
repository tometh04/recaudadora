'use client';

import { MessageSquare } from 'lucide-react';

export default function EmptyChatState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
        <MessageSquare className="w-10 h-10 text-slate-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-300 mb-2">
        WhatsApp Mensajes
      </h2>
      <p className="text-slate-500 text-sm max-w-sm">
        Selecciona una conversacion de la lista para ver los mensajes
      </p>
    </div>
  );
}
