import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
  downloadMediaMessage,
  getContentType,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { mkdirSync, existsSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';

import { config } from './config.js';
import type { SessionInfo, SessionStatus, WhatsAppMessage, MessageType, MessageQuery } from './types.js';

const logger = pino({ level: 'silent' });

interface SessionData {
  socket: WASocket | null;
  info: SessionInfo;
  saveCreds: () => Promise<void>;
  retryCount: number;
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private messages: WhatsAppMessage[] = [];

  constructor() {
    mkdirSync(config.AUTH_DIR, { recursive: true });
    mkdirSync(config.MEDIA_DIR, { recursive: true });
  }

  async createSession(id: string): Promise<SessionInfo> {
    // If session already exists, return it
    const existing = this.sessions.get(id);
    if (existing) {
      return existing.info;
    }

    const authDir = join(config.AUTH_DIR, id);
    mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sessionData: SessionData = {
      socket: null,
      info: {
        id,
        status: 'connecting',
        phoneNumber: null,
        name: null,
        qrDataUrl: null,
        createdAt: new Date().toISOString(),
        lastMessageAt: null,
        messageCount: 0,
      },
      saveCreds,
      retryCount: 0,
    };

    this.sessions.set(id, sessionData);

    await this.connectSocket(id, state);

    return sessionData.info;
  }

  private async connectSocket(id: string, state: any): Promise<void> {
    const sessionData = this.sessions.get(id);
    if (!sessionData) return;

    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: true,
      browser: Browsers.ubuntu('Gestion-Recaudadora'),
      logger,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
    });

    sessionData.socket = socket;

    // Connection updates (QR codes, connection status)
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: '#ffffff', light: '#0f172a' },
          });
          sessionData.info.status = 'qr_ready';
          sessionData.info.qrDataUrl = qrDataUrl;
          console.log(`[${id}] QR code generated`);
        } catch (err) {
          console.error(`[${id}] QR generation error:`, err);
        }
      }

      if (connection === 'open') {
        sessionData.info.status = 'connected';
        sessionData.info.qrDataUrl = null;
        sessionData.retryCount = 0;

        // Extract phone number and name from socket state
        const user = socket.user;
        if (user) {
          sessionData.info.phoneNumber = user.id.split(':')[0] || user.id.split('@')[0];
          sessionData.info.name = user.name || null;
        }
        console.log(`[${id}] Connected! Phone: ${sessionData.info.phoneNumber}`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[${id}] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (shouldReconnect && sessionData.retryCount < 5) {
          sessionData.retryCount++;
          sessionData.info.status = 'connecting';
          sessionData.info.qrDataUrl = null;

          // Wait before reconnecting
          const delay = Math.min(sessionData.retryCount * 2000, 10000);
          setTimeout(async () => {
            try {
              const authDir = join(config.AUTH_DIR, id);
              const { state: newState, saveCreds: newSaveCreds } = await useMultiFileAuthState(authDir);
              sessionData.saveCreds = newSaveCreds;
              await this.connectSocket(id, newState);
            } catch (err) {
              console.error(`[${id}] Reconnection error:`, err);
              sessionData.info.status = 'disconnected';
            }
          }, delay);
        } else {
          sessionData.info.status = 'disconnected';
          if (statusCode === DisconnectReason.loggedOut) {
            // Clean up auth files on logout
            const authDir = join(config.AUTH_DIR, id);
            try {
              rmSync(authDir, { recursive: true, force: true });
              mkdirSync(authDir, { recursive: true });
            } catch {}
          }
        }
      }
    });

    // Persist credentials on update
    socket.ev.on('creds.update', sessionData.saveCreds);

    // Incoming messages
    socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;

      for (const msg of msgs) {
        try {
          await this.processMessage(id, msg);
        } catch (err) {
          console.error(`[${id}] Error processing message:`, err);
        }
      }
    });
  }

  private async processMessage(sessionId: string, msg: any): Promise<void> {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) return;

    const remoteJid = msg.key.remoteJid || '';
    const fromMe = msg.key.fromMe || false;
    const pushName = msg.pushName || null;
    const timestamp = typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp
      : parseInt(msg.messageTimestamp?.toString() || '0', 10);

    // Extract phone number from JID
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

    // Determine message type
    const messageContent = msg.message;
    if (!messageContent) return;

    const contentType = getContentType(messageContent);
    let messageType: MessageType = 'other';
    let textContent: string | null = null;
    let mediaUrl: string | null = null;
    let mimeType: string | null = null;

    if (contentType === 'conversation' || contentType === 'extendedTextMessage') {
      messageType = 'text';
      textContent = messageContent.conversation || messageContent.extendedTextMessage?.text || null;
    } else if (contentType === 'imageMessage') {
      messageType = 'image';
      textContent = messageContent.imageMessage?.caption || null;
      mimeType = messageContent.imageMessage?.mimetype || 'image/jpeg';
    } else if (contentType === 'videoMessage') {
      messageType = 'video';
      textContent = messageContent.videoMessage?.caption || null;
      mimeType = messageContent.videoMessage?.mimetype || 'video/mp4';
    } else if (contentType === 'documentMessage') {
      messageType = 'document';
      textContent = messageContent.documentMessage?.fileName || null;
      mimeType = messageContent.documentMessage?.mimetype || 'application/octet-stream';
    } else if (contentType === 'audioMessage') {
      messageType = 'audio';
      mimeType = messageContent.audioMessage?.mimetype || 'audio/ogg';
    } else if (contentType === 'stickerMessage') {
      messageType = 'sticker';
      mimeType = 'image/webp';
    }

    // Download media if present
    if (['image', 'video', 'document', 'audio', 'sticker'].includes(messageType)) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger,
            reuploadRequest: sessionData.socket!.updateMediaMessage,
          }
        );

        if (buffer && Buffer.isBuffer(buffer)) {
          const ext = this.getExtFromMime(mimeType || '');
          const filename = `${sessionId}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
          const filepath = join(config.MEDIA_DIR, filename);
          writeFileSync(filepath, buffer);
          mediaUrl = `/media/${filename}`;
        }
      } catch (err) {
        console.error(`[${sessionId}] Media download error:`, err);
      }
    }

    const waMessage: WhatsAppMessage = {
      id: msg.key.id || randomUUID(),
      sessionId,
      remoteJid,
      phoneNumber,
      pushName,
      fromMe,
      messageType,
      textContent,
      mediaUrl,
      mimeType,
      timestamp,
      createdAt: new Date(timestamp * 1000).toISOString(),
    };

    this.messages.push(waMessage);
    sessionData.info.lastMessageAt = waMessage.createdAt;
    sessionData.info.messageCount++;

    // Cap messages
    if (this.messages.length > config.MAX_MESSAGES) {
      this.messages = this.messages.slice(-config.MAX_MESSAGES);
    }

    console.log(`[${sessionId}] Message from ${phoneNumber}: ${messageType} ${textContent?.slice(0, 50) || ''}`);
  }

  private getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    return map[mime] || '.bin';
  }

  async deleteSession(id: string): Promise<void> {
    const sessionData = this.sessions.get(id);
    if (!sessionData) return;

    try {
      if (sessionData.socket) {
        await sessionData.socket.logout();
      }
    } catch {
      // Socket might already be closed
      try {
        sessionData.socket?.end(undefined);
      } catch {}
    }

    // Remove auth files
    const authDir = join(config.AUTH_DIR, id);
    try {
      rmSync(authDir, { recursive: true, force: true });
    } catch {}

    // Remove messages for this session
    this.messages = this.messages.filter(m => m.sessionId !== id);

    this.sessions.delete(id);
    console.log(`[${id}] Session deleted`);
  }

  async restartSession(id: string): Promise<SessionInfo | null> {
    const sessionData = this.sessions.get(id);
    if (!sessionData) return null;

    // Close existing socket
    try {
      sessionData.socket?.end(undefined);
    } catch {}

    sessionData.info.status = 'connecting';
    sessionData.info.qrDataUrl = null;
    sessionData.retryCount = 0;

    const authDir = join(config.AUTH_DIR, id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    sessionData.saveCreds = saveCreds;

    await this.connectSocket(id, state);
    return sessionData.info;
  }

  getSession(id: string): SessionInfo | null {
    return this.sessions.get(id)?.info || null;
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  getMessages(query: MessageQuery): { messages: WhatsAppMessage[]; total: number } {
    let filtered = [...this.messages];

    if (query.sessionId) {
      filtered = filtered.filter(m => m.sessionId === query.sessionId);
    }

    if (query.phone) {
      filtered = filtered.filter(m => m.phoneNumber.includes(query.phone!));
    }

    if (query.since) {
      filtered = filtered.filter(m => m.timestamp > query.since!);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const total = filtered.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;

    return {
      messages: filtered.slice(offset, offset + limit),
      total,
    };
  }

  getMessage(id: string): WhatsAppMessage | undefined {
    return this.messages.find(m => m.id === id);
  }

  async restoreAllSessions(): Promise<void> {
    if (!existsSync(config.AUTH_DIR)) return;

    const dirs = readdirSync(config.AUTH_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    console.log(`Restoring ${dirs.length} session(s)...`);

    for (const dir of dirs) {
      try {
        await this.createSession(dir);
        console.log(`Restored session: ${dir}`);
      } catch (err) {
        console.error(`Failed to restore session ${dir}:`, err);
      }
    }
  }
}
