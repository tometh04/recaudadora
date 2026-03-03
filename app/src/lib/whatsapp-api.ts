import type { SessionInfo, WhatsAppMessage, MessageQuery } from '@/types/whatsapp';

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
