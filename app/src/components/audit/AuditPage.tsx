'use client';

import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Calendar,
  Download,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { AuditEvent } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    return 'bg-muted/50 text-muted-foreground';
  }

  function getEntityColor(entity: string) {
    return ENTITY_COLORS[entity] || 'bg-muted/50 text-muted-foreground';
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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-400" />
            Auditoría
          </h1>
          <p className="text-muted-foreground mt-1">
            Registro inmutable de acciones del sistema
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Filter className="w-4 h-4 text-muted-foreground" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>

          {/* Action filter */}
          <Select
            value={actionFilter || '_none'}
            onValueChange={(val) => setActionFilter(val === '_none' ? '' : val)}
          >
            <SelectTrigger className="w-auto min-w-[180px]">
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Todas las acciones</SelectItem>
              {actionOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a] || a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Entity filter */}
          <Select
            value={entityFilter || '_none'}
            onValueChange={(val) => setEntityFilter(val === '_none' ? '' : val)}
          >
            <SelectTrigger className="w-auto min-w-[180px]">
              <SelectValue placeholder="Todas las entidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Todas las entidades</SelectItem>
              {entityOptions.map((e) => (
                <SelectItem key={e} value={e}>
                  {ENTITY_LABELS[e] || e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-auto"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-auto"
            />
          </div>

          {(search || actionFilter || entityFilter || dateFrom || dateTo) && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setSearch('');
                setActionFilter('');
                setEntityFilter('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount} evento{totalCount !== 1 ? 's' : ''} encontrado
          {totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <Card className="py-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="p-4">Fecha</TableHead>
              <TableHead className="p-4">Usuario</TableHead>
              <TableHead className="p-4">Acción</TableHead>
              <TableHead className="p-4">Entidad</TableHead>
              <TableHead className="p-4">ID</TableHead>
              <TableHead className="p-4">Resumen</TableHead>
              <TableHead className="p-4 text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    Cargando eventos...
                  </div>
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                  No hay eventos registrados
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => {
                const summary = buildSummary(event);
                return (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <TableCell className="p-4 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(event.created_at)}
                    </TableCell>
                    <TableCell className="p-4 text-foreground">
                      {(event.user as unknown as { full_name: string })
                        ?.full_name || '—'}
                    </TableCell>
                    <TableCell className="p-4">
                      <Badge className={cn('rounded', getActionColor(event.action))}>
                        {ACTION_LABELS[event.action] || event.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-4">
                      <Badge className={cn('rounded', getEntityColor(event.entity_type))}>
                        {ENTITY_LABELS[event.entity_type] ||
                          event.entity_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-4 text-muted-foreground text-xs font-mono">
                      {event.entity_id?.slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell className="p-4 text-muted-foreground text-xs max-w-xs truncate">
                      {summary}
                    </TableCell>
                    <TableCell className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(event);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
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
                <Button
                  key={pageNum}
                  variant={pageNum === page ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Detalle del Evento
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className="overflow-y-auto space-y-5">
              {/* Event info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                  <p className="text-foreground text-sm">
                    {formatDateTime(selectedEvent.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Usuario</p>
                  <p className="text-foreground text-sm">
                    {(selectedEvent.user as unknown as { full_name: string })?.full_name ||
                      '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Acción</p>
                  <p className="text-foreground text-sm">
                    {ACTION_LABELS[selectedEvent.action] || selectedEvent.action}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Entidad</p>
                  <p className="text-foreground text-sm">
                    {ENTITY_LABELS[selectedEvent.entity_type] || selectedEvent.entity_type}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">ID Entidad</p>
                  <p className="text-foreground text-sm font-mono">
                    {selectedEvent.entity_id || '—'}
                  </p>
                </div>
              </div>

              {/* Before data */}
              {selectedEvent.before_data && Object.keys(selectedEvent.before_data).length > 0 && (
                <div>
                  <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                    ← Datos anteriores
                  </p>
                  <div className="bg-red-500/5 border border-red-900/30 rounded-lg p-4">
                    <JsonViewer data={selectedEvent.before_data} variant="before" />
                  </div>
                </div>
              )}

              {/* After data */}
              {selectedEvent.after_data && Object.keys(selectedEvent.after_data).length > 0 && (
                <div>
                  <p className="text-xs text-green-400 font-medium mb-2 flex items-center gap-1">
                    → Datos posteriores
                  </p>
                  <div className="bg-green-500/5 border border-green-900/30 rounded-lg p-4">
                    <JsonViewer data={selectedEvent.after_data} variant="after" />
                  </div>
                </div>
              )}

              {/* Metadata */}
              {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    Metadata
                  </p>
                  <div className="bg-muted/50 border border-border rounded-lg p-4">
                    <JsonViewer data={selectedEvent.metadata} variant="neutral" />
                  </div>
                </div>
              )}

              {/* IP */}
              {selectedEvent.ip_address && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                  <p className="text-muted-foreground text-sm font-mono">
                    {selectedEvent.ip_address}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
      : 'text-muted-foreground';

  return (
    <div className="space-y-1.5 text-xs font-mono">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className={cn('font-medium shrink-0', keyColor)}>{key}:</span>
          <span className="text-muted-foreground break-all">
            {typeof value === 'object' && value !== null
              ? JSON.stringify(value, null, 2)
              : String(value ?? 'null')}
          </span>
        </div>
      ))}
    </div>
  );
}
