export type SessionStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected';

export interface SessionInfo {
  id: string;
  status: SessionStatus;
  phoneNumber: string | null;
  name: string | null;
  qrDataUrl: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'other';

export interface WhatsAppMessage {
  id: string;
  sessionId: string;
  remoteJid: string;
  phoneNumber: string;
  pushName: string | null;
  fromMe: boolean;
  messageType: MessageType;
  textContent: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  timestamp: number;
  createdAt: string;
}

export interface MessageQuery {
  sessionId?: string;
  phone?: string;
  since?: number;
  limit?: number;
  offset?: number;
}
