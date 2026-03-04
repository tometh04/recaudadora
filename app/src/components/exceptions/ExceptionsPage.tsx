'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { EXCEPTION_LABELS, EXCEPTION_COLORS, EXCEPTION_DESCRIPTIONS } from '@/lib/exceptions';
import {
  AlertOctagon,
  Search,
  CheckCircle2,
  Eye,
  ExternalLink,
  X,
  Filter,
} from 'lucide-react';
import type { ExceptionType } from '@/types/database';

interface Exception {
  id: string;
  exception_type: ExceptionType;
  inbox_item_id: string | null;
  bank_transaction_id: string | null;
  description: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  inbox_item?: {
    id: string;
    reference_number?: string;
    amount?: number;
    status?: string;
    client?: { name: string };
  };
}

const DEMO_EXCEPTIONS: Exception[] = [
  {
    id: 'exc-1',
    exception_type: 'duplicado_probable',
    inbox_item_id: 'inb-1',
    bank_transaction_id: null,
    description: 'Dos comprobantes de Mutual Rosario por $29,000 en menos de 24h',
    is_resolved: false,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    inbox_item: { id: 'inb-1', reference_number: 'TK-001', amount: 29000, status: 'verificado', client: { name: 'Mutual Rosario' } },
  },
  {
    id: 'exc-2',
    exception_type: 'ocr_baja_confianza',
    inbox_item_id: 'inb-3',
    bank_transaction_id: null,
    description: 'OCR con confianza baja en monto detectado',
    is_resolved: false,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    inbox_item: { id: 'inb-3', reference_number: 'TK-003', amount: 15200, status: 'ocr_listo', client: { name: 'Cooperativa Sur' } },
  },
  {
    id: 'exc-3',
    exception_type: 'ticket_sin_movimiento',
    inbox_item_id: 'inb-5',
    bank_transaction_id: null,
    description: 'Comprobante verificado hace >48h sin conciliacion bancaria',
    is_resolved: true,
    resolved_by: 'demo-user-1',
    resolved_at: new Date(Date.now() - 86400000).toISOString(),
    resolution_notes: 'Banco confirmo transferencia pendiente. Se concilio manualmente.',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    inbox_item: { id: 'inb-5', reference_number: 'TK-005', amount: 63400, status: 'aplicado', client: { name: 'Mutual Rosario' } },
  },
  {
    id: 'exc-4',
    exception_type: 'monto_discrepante',
    inbox_item_id: 'inb-7',
    bank_transaction_id: 'tx-7',
    description: 'Conciliacion con score 0.55 - monto del ticket ($45,000) difiere del movimiento ($44,500)',
    is_resolved: false,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: new Date(Date.now() - 10800000).toISOString(),
    inbox_item: { id: 'inb-7', reference_number: 'TK-007', amount: 45000, status: 'verificado', client: { name: 'Financiera Norte' } },
  },
];

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ExceptionType | 'todos'>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'abiertas' | 'resueltas'>('abiertas');
  const [search, setSearch] = useState('');
  const [selectedExc, setSelectedExc] = useState<Exception | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    if (isDemoMode()) {
      setExceptions(DEMO_EXCEPTIONS);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { data } = await supabase
      .from('exceptions')
      .select('*, inbox_item:inbox_items(id, reference_number, amount, status, client:b2b_clients(name))')
      .order('created_at', { ascending: false })
      .limit(200);

    setExceptions((data as Exception[]) || []);
    setLoading(false);
  }

  async function handleResolve(excId: string) {
    if (isDemoMode()) {
      setExceptions((prev) =>
        prev.map((e) =>
          e.id === excId
            ? { ...e, is_resolved: true, resolved_at: new Date().toISOString(), resolution_notes: resolutionNotes || null }
            : e
        )
      );
      setSelectedExc(null);
      setResolutionNotes('');
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('exceptions').update({
      is_resolved: true,
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes || null,
    }).eq('id', excId);

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'exception_resolved',
      entity_type: 'exceptions',
      entity_id: excId,
      after_data: { resolution_notes: resolutionNotes },
    });

    setSelectedExc(null);
    setResolutionNotes('');
    loadData();
  }

  const filtered = exceptions.filter((e) => {
    if (typeFilter !== 'todos' && e.exception_type !== typeFilter) return false;
    if (statusFilter === 'abiertas' && e.is_resolved) return false;
    if (statusFilter === 'resueltas' && !e.is_resolved) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        e.inbox_item?.reference_number?.toLowerCase().includes(q) ||
        e.inbox_item?.client?.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCount = exceptions.filter((e) => !e.is_resolved).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-orange-400" />
            Excepciones
            {openCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500/10 text-red-400 text-sm rounded-lg font-medium">
                {openCount} abiertas
              </span>
            )}
          </h1>
          <p className="text-slate-400 mt-1">
            Anomalias y situaciones que requieren atencion
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-slate-900/50 border border-slate-800 rounded-lg p-0.5">
          {(['todos', 'abiertas', 'resueltas'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition capitalize',
                statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ExceptionType | 'todos')}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos los tipos</option>
          {Object.entries(EXCEPTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs">
                <th className="text-left p-4">Tipo</th>
                <th className="text-left p-4">Descripcion</th>
                <th className="text-left p-4">Comprobante</th>
                <th className="text-left p-4">Cliente</th>
                <th className="text-right p-4">Monto</th>
                <th className="text-left p-4">Fecha</th>
                <th className="text-center p-4">Estado</th>
                <th className="text-right p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    {statusFilter === 'abiertas' ? 'No hay excepciones abiertas' : 'No hay excepciones'}
                  </td>
                </tr>
              ) : (
                filtered.map((exc) => (
                  <tr
                    key={exc.id}
                    className={cn(
                      'border-b border-slate-800/50 hover:bg-slate-800/30 transition cursor-pointer',
                      exc.is_resolved && 'opacity-60'
                    )}
                    onClick={() => {
                      setSelectedExc(exc);
                      setResolutionNotes(exc.resolution_notes || '');
                    }}
                  >
                    <td className="p-4">
                      <span className={cn('px-2 py-1 rounded-md text-xs font-medium', EXCEPTION_COLORS[exc.exception_type])}>
                        {EXCEPTION_LABELS[exc.exception_type]}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300 text-xs max-w-[250px] truncate">{exc.description}</td>
                    <td className="p-4 text-white font-mono text-xs">{exc.inbox_item?.reference_number || '—'}</td>
                    <td className="p-4 text-slate-300 text-xs">{exc.inbox_item?.client?.name || '—'}</td>
                    <td className="p-4 text-right text-white font-mono text-xs">
                      {exc.inbox_item?.amount ? formatCurrency(exc.inbox_item.amount) : '—'}
                    </td>
                    <td className="p-4 text-slate-500 text-xs">{formatDateTime(exc.created_at)}</td>
                    <td className="p-4 text-center">
                      {exc.is_resolved ? (
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">Resuelta</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded">Abierta</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-1.5 text-slate-400 hover:text-white transition">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedExc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-5 h-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-white">Detalle de Excepcion</h2>
              </div>
              <button
                onClick={() => setSelectedExc(null)}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className={cn('px-2.5 py-1 rounded-lg text-sm font-medium', EXCEPTION_COLORS[selectedExc.exception_type])}>
                  {EXCEPTION_LABELS[selectedExc.exception_type]}
                </span>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Descripcion</p>
                <p className="text-sm text-white">{selectedExc.description}</p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Que significa</p>
                <p className="text-xs text-slate-300">{EXCEPTION_DESCRIPTIONS[selectedExc.exception_type]}</p>
              </div>

              {selectedExc.inbox_item && (
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-slate-400">Comprobante relacionado</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">
                        {selectedExc.inbox_item.reference_number || selectedExc.inbox_item.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedExc.inbox_item.client?.name} · {selectedExc.inbox_item.amount ? formatCurrency(selectedExc.inbox_item.amount) : ''}
                      </p>
                    </div>
                    <a href="/inbox" className="text-blue-400 hover:text-blue-300 transition">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-500">
                Creada: {formatDateTime(selectedExc.created_at)}
              </div>

              {selectedExc.is_resolved ? (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <p className="text-xs text-green-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Resuelta {selectedExc.resolved_at ? `el ${formatDateTime(selectedExc.resolved_at)}` : ''}
                  </p>
                  {selectedExc.resolution_notes && (
                    <p className="text-sm text-white">{selectedExc.resolution_notes}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Notas de resolucion</label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Como se resolvio esta excepcion..."
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
                    />
                  </div>
                  <button
                    onClick={() => handleResolve(selectedExc.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Marcar como Resuelta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
