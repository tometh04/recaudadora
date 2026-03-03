'use client';

import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Filter,
  Calendar,
  Download,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { AuditEvent } from '@/types/database';

const PAGE_SIZE = 25;

const ACTION_COLORS: Record<string, string> = {
  // Created
  inbox_item_created: 'bg-green-500/10 text-green-400',
  client_created: 'bg-green-500/10 text-green-400',
  account_created: 'bg-green-500/10 text-green-400',
  ledger_entry_created: 'bg-green-500/10 text-green-400',
  // Verified/Confirmed
  inbox_item_verified: 'bg-blue-500/10 text-blue-400',
  reconciliation_confirmed: 'bg-blue-500/10 text-blue-400',
  // Rejected/Deleted
  inbox_item_rejected: 'bg-red-500/10 text-red-400',
  inbox_item_deleted: 'bg-red-500/10 text-red-400',
  reconciliation_undone: 'bg-red-500/10 text-red-400',
  // Bulk
  bulk_verify: 'bg-purple-500/10 text-purple-400',
  bulk_reject: 'bg-purple-500/10 text-purple-400',
  bulk_delete: 'bg-purple-500/10 text-purple-400',
  bulk_reconciliation_confirmed: 'bg-purple-500/10 text-purple-400',
  // Reversal
  ledger_entry_reversal: 'bg-yellow-500/10 text-yellow-400',
  // Update
  client_updated: 'bg-cyan-500/10 text-cyan-400',
  account_updated: 'bg-cyan-500/10 text-cyan-400',
  inbox_item_updated: 'bg-cyan-500/10 text-cyan-400',
};

const ENTITY_COLORS: Record<string, string> = {
  inbox_items: 'bg-orange-500/10 text-orange-400',
  b2b_clients: 'bg-emerald-500/10 text-emerald-400',
  accounts: 'bg-sky-500/10 text-sky-400',
  ledger_entries: 'bg-violet-500/10 text-violet-400',
  reconciliations: 'bg-indigo-500/10 text-indigo-400',
  bank_transactions: 'bg-teal-500/10 text-teal-400',
};

const ACTION_LABELS: Record<string, string> = {
  inbox_item_created: 'Comprobante creado',
  inbox_item_verified: 'Comprobante verificado',
  inbox_item_rejected: 'Comprobante rechazado',
  inbox_item_deleted: 'Comprobante eliminado',
  inbox_item_updated: 'Comprobante actualizado',
  client_created: 'Cliente creado',
  client_updated: 'Cliente actualizado',
  account_created: 'Cuenta creada',
  account_updated: 'Cuenta actualizada',
  ledger_entry_created: 'Movimiento creado',
  ledger_entry_reversal: 'Movimiento reversado',
  reconciliation_confirmed: 'Conciliación confirmada',
  reconciliation_undone: 'Conciliación deshecha',
  bulk_verify: 'Verificación masiva',
  bulk_reject: 'Rechazo masivo',
  bulk_delete: 'Eliminación masiva',
  bulk_reconciliation_confirmed: 'Conciliación masiva',
};

const ENTITY_LABELS: Record<string, string> = {
  inbox_items: 'Comprobantes',
  b2b_clients: 'Clientes',
  accounts: 'Cuentas',
  ledger_entries: 'Cuenta Corriente',
  reconciliations: 'Conciliación',
  bank_transactions: 'Mov. Bancarios',
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Available filter options
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [entityOptions, setEntityOptions] = useState<string[]>([]);

  const loadEvents = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      setEvents([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    let query = supabase
      .from('audit_events')
      .select('*, user:profiles(full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) {
      query = query.or(
        `action.ilike.%${search}%,entity_type.ilike.%${search}%,entity_id.ilike.%${search}%`
      );
    }
    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }
    if (entityFilter) {
      query = query.eq('entity_type', entityFilter);
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data, count } = await query;
    setEvents((data as AuditEvent[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, search, actionFilter, entityFilter, dateFrom, dateTo]);

  // Load filter options once
  useEffect(() => {
    async function loadFilters() {
      if (isDemoMode()) return;
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const [actionsRes, entitiesRes] = await Promise.all([
        supabase.from('audit_events').select('action').limit(500),
        supabase.from('audit_events').select('entity_type').limit(500),
      ]);

      const actions = [
        ...new Set((actionsRes.data || []).map((a: { action: string }) => a.action)),
      ].sort();
      const entities = [
        ...new Set(
          (entitiesRes.data || []).map(
            (e: { entity_type: string }) => e.entity_type
          )
        ),
      ].sort();

      setActionOptions(actions as string[]);
      setEntityOptions(entities as string[]);
    }
    loadFilters();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, actionFilter, entityFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function getActionColor(action: string) {
    if (ACTION_COLORS[action]) return ACTION_COLORS[action];
    if (action.includes('created')) return 'bg-green-500/10 text-green-400';
    if (action.includes('verified') || action.includes('confirmed'))
      return 'bg-blue-500/10 text-blue-400';
    if (action.includes('rejected') || action.includes('deleted'))
      return 'bg-red-500/10 text-red-400';
    if (action.startsWith('bulk_')) return 'bg-purple-500/10 text-purple-400';
    if (action.includes('reversal')) return 'bg-yellow-500/10 text-yellow-400';
    if (action.includes('updated')) return 'bg-cyan-500/10 text-cyan-400';
    return 'bg-slate-500/10 text-slate-400';
  }

  function getEntityColor(entity: string) {
    return ENTITY_COLORS[entity] || 'bg-slate-500/10 text-slate-400';
  }

  async function exportCSV() {
    if (isDemoMode()) return;

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    let query = supabase
      .from('audit_events')
      .select('*, user:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (entityFilter) query = query.eq('entity_type', entityFilter);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

    const { data } = await query;
    if (!data || data.length === 0) return;

    const rows = [
      ['Fecha', 'Usuario', 'Acción', 'Entidad', 'ID Entidad', 'Resumen'].join(','),
      ...(data as AuditEvent[]).map((e) =>
        [
          e.created_at,
          (e.user as unknown as { full_name: string })?.full_name || '—',
          e.action,
          e.entity_type,
          e.entity_id || '',
          JSON.stringify(e.after_data || e.before_data || {}).replace(/,/g, ';'),
        ].join(',')
      ),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <Filter className="w-4 h-4 text-slate-400" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-48"
          />
        </div>

        {/* Action filter */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Todas las acciones</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] || a}
            </option>
          ))}
        </select>

        {/* Entity filter */}
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Todas las entidades</option>
          {entityOptions.map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABELS[e] || e}
            </option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-slate-500">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {(search || actionFilter || entityFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch('');
              setActionFilter('');
              setEntityFilter('');
              setDateFrom('');
              setDateTo('');
            }}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {totalCount} evento{totalCount !== 1 ? 's' : ''} encontrado
          {totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
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
                  ID
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Resumen
                </th>
                <th className="text-right p-4 text-slate-400 font-medium">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      Cargando eventos...
                    </div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No hay eventos registrados
                  </td>
                </tr>
              ) : (
                events.map((event) => {
                  const summary = buildSummary(event);
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <td className="p-4 text-slate-300 whitespace-nowrap">
                        {formatDateTime(event.created_at)}
                      </td>
                      <td className="p-4 text-white">
                        {(event.user as unknown as { full_name: string })
                          ?.full_name || '—'}
                      </td>
                      <td className="p-4">
                        <span
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium',
                            getActionColor(event.action)
                          )}
                        >
                          {ACTION_LABELS[event.action] || event.action}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium',
                            getEntityColor(event.entity_type)
                          )}
                        >
                          {ENTITY_LABELS[event.entity_type] ||
                            event.entity_type}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 text-xs font-mono">
                        {event.entity_id?.slice(0, 8) || '—'}
                      </td>
                      <td className="p-4 text-slate-400 text-xs max-w-xs truncate">
                        {summary}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-lg transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-8 h-8 text-sm rounded-lg transition',
                    pageNum === page
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-lg transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function buildSummary(event: AuditEvent): string {
  const data = event.after_data || event.before_data;
  if (!data) return '—';

  if (typeof data === 'object') {
    // For bulk actions, show count
    if ('count' in data) return `${data.count} elementos`;
    // For amounts
    if ('amount' in data) return `$${Number(data.amount).toLocaleString('es-AR')}`;
    // For names
    if ('name' in data) return String(data.name);
    // For client names
    if ('client_name' in data) return String(data.client_name);
    // For reconciliations
    if ('inbox_item_id' in data && 'bank_transaction_id' in data)
      return 'Match ticket ↔ movimiento';
    // For reversals
    if ('reason' in data) return String(data.reason);
  }

  return '—';
}

function EventDetailModal({
  event,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl m-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Detalle del Evento
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Event info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Fecha</p>
              <p className="text-white text-sm">
                {formatDateTime(event.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Usuario</p>
              <p className="text-white text-sm">
                {(event.user as unknown as { full_name: string })?.full_name ||
                  '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Acción</p>
              <p className="text-white text-sm">
                {ACTION_LABELS[event.action] || event.action}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Entidad</p>
              <p className="text-white text-sm">
                {ENTITY_LABELS[event.entity_type] || event.entity_type}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate-500 mb-1">ID Entidad</p>
              <p className="text-white text-sm font-mono">
                {event.entity_id || '—'}
              </p>
            </div>
          </div>

          {/* Before data */}
          {event.before_data && Object.keys(event.before_data).length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                ← Datos anteriores
              </p>
              <div className="bg-red-500/5 border border-red-900/30 rounded-lg p-4">
                <JsonViewer data={event.before_data} variant="before" />
              </div>
            </div>
          )}

          {/* After data */}
          {event.after_data && Object.keys(event.after_data).length > 0 && (
            <div>
              <p className="text-xs text-green-400 font-medium mb-2 flex items-center gap-1">
                → Datos posteriores
              </p>
              <div className="bg-green-500/5 border border-green-900/30 rounded-lg p-4">
                <JsonViewer data={event.after_data} variant="after" />
              </div>
            </div>
          )}

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">
                Metadata
              </p>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <JsonViewer data={event.metadata} variant="neutral" />
              </div>
            </div>
          )}

          {/* IP */}
          {event.ip_address && (
            <div>
              <p className="text-xs text-slate-500 mb-1">IP Address</p>
              <p className="text-slate-400 text-sm font-mono">
                {event.ip_address}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JsonViewer({
  data,
  variant,
}: {
  data: Record<string, unknown>;
  variant: 'before' | 'after' | 'neutral';
}) {
  const keyColor =
    variant === 'before'
      ? 'text-red-300'
      : variant === 'after'
      ? 'text-green-300'
      : 'text-slate-300';

  return (
    <div className="space-y-1.5 text-xs font-mono">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className={cn('font-medium shrink-0', keyColor)}>{key}:</span>
          <span className="text-slate-400 break-all">
            {typeof value === 'object' && value !== null
              ? JSON.stringify(value, null, 2)
              : String(value ?? 'null')}
          </span>
        </div>
      ))}
    </div>
  );
}
