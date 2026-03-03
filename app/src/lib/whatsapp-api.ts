import type { SessionInfo, WhatsAppMessage, MessageQuery, Conversation } from '@/types/whatsapp';

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API Error: ${res.status}`);
  }

  return res.json();
}

export const whatsappApi = {
  // Sessions
  async getSessions(): Promise<SessionInfo[]> {
    return apiFetch<SessionInfo[]>('/api/sessions');
  },

  async getSession(id: string): Promise<SessionInfo> {
    return apiFetch<SessionInfo>(`/api/sessions/${id}`);
  },

  async createSession(id: string): Promise<SessionInfo> {
    return apiFetch<SessionInfo>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  async deleteSession(id: string): Promise<void> {
    await apiFetch<{ ok: boolean }>(`/api/sessions/${id}`, {
      method: 'DELETE',
    });
  },

  async restartSession(id: string): Promise<SessionInfo> {
    return apiFetch<SessionInfo>(`/api/sessions/${id}/restart`, {
      method: 'POST',
    });
  },

  // Messages
  async getMessages(query: MessageQuery = {}): Promise<{
    messages: WhatsAppMessage[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (query.sessionId) params.set('sessionId', query.sessionId);
    if (query.phone) params.set('phone', query.phone);
    if (query.since) params.set('since', query.since.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.offset) params.set('offset', query.offset.toString());

    const qs = params.toString();
    return apiFetch<{ messages: WhatsAppMessage[]; total: number }>(
      `/api/messages${qs ? `?${qs}` : ''}`
    );
  },

  // Health
  async health(): Promise<{ status: string; sessions: number; uptime: number }> {
    return apiFetch('/api/health');
  },

  // Media URL helper
  getMediaUrl(mediaPath: string): string {
    return `${getBaseUrl()}${mediaPath}`;
  },
};

/**
 * Group flat messages array into conversations by remoteJid.
 * Sorted by last message timestamp (most recent first).
 */
export function groupByConversation(messages: WhatsAppMessage[]): Conversation[] {
  const map = new Map<string, WhatsAppMessage[]>();

  for (const msg of messages) {
    const jid = msg.remoteJid;
    if (!map.has(jid)) map.set(jid, []);
    map.get(jid)!.push(msg);
  }

  const conversations: Conversation[] = [];

  for (const [jid, msgs] of map) {
    // Sort messages oldest first (for chat view)
    msgs.sort((a, b) => a.timestamp - b.timestamp);

    const lastMsg = msgs[msgs.length - 1];
    const incomingCount = msgs.filter((m) => !m.fromMe).length;

    conversations.push({
      remoteJid: jid,
      phoneNumber: lastMsg.phoneNumber,
      pushName: msgs.find((m) => m.pushName && !m.fromMe)?.pushName || lastMsg.pushName,
      lastMessage: lastMsg,
      messages: msgs,
      unreadCount: incomingCount,
    });
  }

  // Sort conversations by last message (most recent first)
  conversations.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);

  return conversations;
}
