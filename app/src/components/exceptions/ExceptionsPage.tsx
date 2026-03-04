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
  Filter,
} from 'lucide-react';
import type { ExceptionType } from '@/types/database';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-orange-400" />
            Excepciones
            {openCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-sm">
                {openCount} abiertas
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Anomalias y situaciones que requieren atencion
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {(['todos', 'abiertas', 'resueltas'] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="capitalize text-xs"
            >
              {s}
            </Button>
          ))}
        </div>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ExceptionType | 'todos')}>
          <SelectTrigger className="w-auto text-xs">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {Object.entries(EXCEPTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Tipo</TableHead>
                <TableHead className="text-left">Descripcion</TableHead>
                <TableHead className="text-left">Comprobante</TableHead>
                <TableHead className="text-left">Cliente</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-left">Fecha</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                    {statusFilter === 'abiertas' ? 'No hay excepciones abiertas' : 'No hay excepciones'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((exc) => (
                  <TableRow
                    key={exc.id}
                    className={cn(
                      'cursor-pointer',
                      exc.is_resolved && 'opacity-60'
                    )}
                    onClick={() => {
                      setSelectedExc(exc);
                      setResolutionNotes(exc.resolution_notes || '');
                    }}
                  >
                    <TableCell>
                      <Badge variant="secondary" className={cn('text-xs', EXCEPTION_COLORS[exc.exception_type])}>
                        {EXCEPTION_LABELS[exc.exception_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[250px] truncate">{exc.description}</TableCell>
                    <TableCell className="text-foreground font-mono text-xs">{exc.inbox_item?.reference_number || '\u2014'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{exc.inbox_item?.client?.name || '\u2014'}</TableCell>
                    <TableCell className="text-right text-foreground font-mono text-xs">
                      {exc.inbox_item?.amount ? formatCurrency(exc.inbox_item.amount) : '\u2014'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDateTime(exc.created_at)}</TableCell>
                    <TableCell className="text-center">
                      {exc.is_resolved ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-400">Resuelta</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-red-500/10 text-red-400">Abierta</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedExc} onOpenChange={(open) => { if (!open) setSelectedExc(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <AlertOctagon className="w-5 h-5 text-orange-400" />
              Detalle de Excepcion
            </DialogTitle>
          </DialogHeader>

          {selectedExc && (
            <div className="space-y-4">
              <div>
                <Badge variant="secondary" className={cn('text-sm', EXCEPTION_COLORS[selectedExc.exception_type])}>
                  {EXCEPTION_LABELS[selectedExc.exception_type]}
                </Badge>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Descripcion</p>
                <p className="text-sm text-foreground">{selectedExc.description}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Que significa</p>
                <p className="text-xs text-muted-foreground">{EXCEPTION_DESCRIPTIONS[selectedExc.exception_type]}</p>
              </div>

              {selectedExc.inbox_item && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Comprobante relacionado</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">
                        {selectedExc.inbox_item.reference_number || selectedExc.inbox_item.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedExc.inbox_item.client?.name} · {selectedExc.inbox_item.amount ? formatCurrency(selectedExc.inbox_item.amount) : ''}
                      </p>
                    </div>
                    <a href="/inbox" className="text-blue-400 hover:text-blue-300 transition">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Creada: {formatDateTime(selectedExc.created_at)}
              </div>

              {selectedExc.is_resolved ? (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <p className="text-xs text-green-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Resuelta {selectedExc.resolved_at ? `el ${formatDateTime(selectedExc.resolved_at)}` : ''}
                  </p>
                  {selectedExc.resolution_notes && (
                    <p className="text-sm text-foreground">{selectedExc.resolution_notes}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <Label>Notas de resolucion</Label>
                    <Textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Como se resolvio esta excepcion..."
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={() => handleResolve(selectedExc.id)}
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Marcar como Resuelta
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
