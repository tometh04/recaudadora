'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Shield, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AuditEvent } from '@/types/database';

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    const { data } = await supabase
      .from('audit_events')
      .select('*, user:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setEvents((data as AuditEvent[]) || []);
    setLoading(false);
  }

  const filtered = events.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.entity_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-400" />
            Auditoría
          </h1>
          <p className="text-slate-400 mt-1">
            Registro inmutable de acciones del sistema
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por acción o entidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left p-4 text-slate-400 font-medium">
                  Fecha
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Usuario
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Acción
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Entidad
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No hay eventos registrados
                  </td>
                </tr>
              ) : (
                filtered.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="p-4 text-slate-300 whitespace-nowrap">
                      {formatDateTime(event.created_at)}
                    </td>
                    <td className="p-4 text-white">
                      {(event.user as unknown as { full_name: string })
                        ?.full_name || '—'}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded text-xs font-medium">
                        {event.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300">{event.entity_type}</td>
                    <td className="p-4 text-slate-500 text-xs max-w-xs truncate">
                      {event.entity_id?.slice(0, 8)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
