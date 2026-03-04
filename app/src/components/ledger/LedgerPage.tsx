'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_LEDGER, DEMO_CLIENTS, DEMO_CLIENT_BALANCES } from '@/lib/demo-data';
import {
  BookOpen,
  Search,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  Download,
} from 'lucide-react';
import { cn, formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import type {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryCategory,
  B2BClient,
  ClientBalance,
} from '@/types/database';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CATEGORY_LABELS: Record<LedgerEntryCategory, string> = {
  deposito_verificado: 'Deposito Verificado',
  entrega: 'Entrega',
  comision: 'Comision',
  ajuste_credito: 'Ajuste Credito',
  ajuste_debito: 'Ajuste Debito',
  reversa: 'Reversa',
};

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [balances, setBalances] = useState<ClientBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LedgerEntryCategory | 'todas'>('todas');
  const [reversalEntry, setReversalEntry] = useState<LedgerEntry | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    if (isDemoMode()) {
      setEntries(DEMO_LEDGER);
      setClients(DEMO_CLIENTS.filter(c => c.is_active));
      setBalances(DEMO_CLIENT_BALANCES);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    let entriesQuery = supabase
      .from('ledger_entries')
      .select('*, client:b2b_clients(name), creator:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (dateFrom) entriesQuery = entriesQuery.gte('created_at', dateFrom);
    if (dateTo) entriesQuery = entriesQuery.lte('created_at', dateTo + 'T23:59:59');

    const [entriesRes, clientsRes, balancesRes] = await Promise.all([
      entriesQuery,
      supabase.from('b2b_clients').select('*').eq('is_active', true).order('name'),
      supabase.from('v_client_balances').select('*'),
    ]);

    setEntries((entriesRes.data as LedgerEntry[]) || []);
    setClients((clientsRes.data as B2BClient[]) || []);
    setBalances((balancesRes.data as ClientBalance[]) || []);
    setLoading(false);
  }

  // Reload when date filters change
  useEffect(() => {
    if (!loading) loadData();
  }, [dateFrom, dateTo]);

  const filtered = entries.filter(e => {
    if (selectedClient !== 'todos' && e.client_id !== selectedClient) return false;
    if (categoryFilter !== 'todas' && e.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.client as unknown as { name: string })?.name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Check which entries have been reversed
  const reversedIds = new Set(entries.filter(e => e.reversal_of).map(e => e.reversal_of!));

  async function handleReversal(entry: LedgerEntry, reason: string) {
    if (isDemoMode()) {
      const reversal: LedgerEntry = {
        id: `led-rev-${Date.now()}`,
        client_id: entry.client_id,
        entry_type: entry.entry_type === 'credito' ? 'debito' : 'credito',
        category: 'reversa',
        amount: entry.amount,
        description: `Reversa de: ${entry.description}`,
        inbox_item_id: null,
        reconciliation_id: null,
        reversal_of: entry.id,
        created_by: 'demo-user-1',
        reason,
        created_at: new Date().toISOString(),
      };
      setEntries(prev => [reversal, ...prev]);
      setReversalEntry(null);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('ledger_entries').insert({
      client_id: entry.client_id,
      entry_type: entry.entry_type === 'credito' ? 'debito' : 'credito',
      category: 'reversa',
      amount: entry.amount,
      description: `Reversa de: ${entry.description}`,
      reversal_of: entry.id,
      created_by: user?.id,
      reason,
    });

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'ledger_reversal_created',
      entity_type: 'ledger_entries',
      entity_id: entry.id,
      after_data: { original_entry_id: entry.id, reason },
    });

    setReversalEntry(null);
    loadData();
  }

  function exportCSV() {
    const headers = ['Fecha', 'Cliente', 'Tipo', 'Categoria', 'Descripcion', 'Monto', 'Usuario'];
    const rows = filtered.map(e => [
      formatDateTime(e.created_at),
      (e.client as unknown as { name: string })?.name || '',
      e.entry_type === 'credito' ? 'Credito' : 'Debito',
      CATEGORY_LABELS[e.category],
      e.description,
      e.entry_type === 'credito' ? e.amount : -e.amount,
      (e.creator as unknown as { full_name: string })?.full_name || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuenta-corriente-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            Cuenta Corriente
          </h1>
          <p className="text-muted-foreground mt-1">Ledger auditable por cliente B2B</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCSV}>
            <Download className="w-4 h-4" /> Exportar
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4" /> Nuevo movimiento
          </Button>
        </div>
      </div>

      {/* Balances */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {balances.slice(0, 8).map(b => (
            <Card
              key={b.client_id}
              onClick={() => setSelectedClient(b.client_id)}
              className={cn(
                'cursor-pointer transition',
                selectedClient === b.client_id
                  ? 'bg-emerald-900/20 border-emerald-700'
                  : 'hover:border-border'
              )}
            >
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground truncate">{b.client_name}</p>
                <p className={cn('text-lg font-bold mt-1', b.saldo >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {formatCurrency(b.saldo)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select
          value={selectedClient}
          onValueChange={setSelectedClient}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos los clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los clientes</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as LedgerEntryCategory | 'todas')}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorias</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-auto"
            placeholder="Desde"
          />
          <span className="text-muted-foreground text-xs">a</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-auto"
            placeholder="Hasta"
          />
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por descripcion..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">Cargando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">No hay movimientos</TableCell>
                </TableRow>
              ) : (
                filtered.map(entry => {
                  const isReversed = reversedIds.has(entry.id);
                  const isReversa = entry.category === 'reversa';

                  return (
                    <TableRow key={entry.id} className={cn(isReversed && 'opacity-50')}>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                      <TableCell className="text-foreground">{(entry.client as unknown as { name: string })?.name}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          {entry.entry_type === 'credito' ? <ArrowUpCircle className="w-4 h-4 text-green-400" /> : <ArrowDownCircle className="w-4 h-4 text-red-400" />}
                          <span className={entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400'}>
                            {entry.entry_type === 'credito' ? 'Credito' : 'Debito'}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={isReversa ? 'outline' : 'secondary'}
                            className={cn(isReversa && 'bg-orange-500/10 text-orange-400 border-orange-500/20')}
                          >
                            {CATEGORY_LABELS[entry.category]}
                          </Badge>
                          {isReversed && (
                            <Badge variant="secondary" className="text-[10px]">Reversado</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">{entry.description}</TableCell>
                      <TableCell className={cn('text-right font-mono font-medium', entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400')}>
                        {entry.entry_type === 'credito' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{(entry.creator as unknown as { full_name: string })?.full_name}</TableCell>
                      <TableCell>
                        {!isReversa && !isReversed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReversalEntry(entry)}
                            className="hover:bg-orange-900/30 text-muted-foreground hover:text-orange-400"
                            title="Reversar"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reversal Modal */}
      <ReversalModal
        entry={reversalEntry}
        open={!!reversalEntry}
        onOpenChange={(open) => { if (!open) setReversalEntry(null); }}
        onConfirm={(reason) => { if (reversalEntry) handleReversal(reversalEntry, reason); }}
      />

      {/* New Entry Modal */}
      <LedgerEntryModal
        clients={clients}
        open={showForm}
        onOpenChange={setShowForm}
        onSave={() => { setShowForm(false); loadData(); }}
      />
    </div>
  );
}

function ReversalModal({
  entry,
  open,
  onOpenChange,
  onConfirm,
}: {
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  // Reset reason when modal opens
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <RotateCcw className="w-5 h-5 text-orange-400" />
            </div>
            Reversar Movimiento
          </DialogTitle>
        </DialogHeader>

        {entry && (
          <>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground text-xs">
                  {(entry.client as unknown as { name: string })?.name}
                </span>
                <span className={cn('text-sm font-mono font-medium', entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400')}>
                  {entry.entry_type === 'credito' ? '+' : '-'}{formatCurrency(entry.amount)}
                </span>
              </div>
              <p className="text-foreground text-sm">{entry.description}</p>
              <p className="text-muted-foreground text-xs mt-1">{formatDateTime(entry.created_at)}</p>
            </div>
            <p className="text-muted-foreground text-sm">
              Se creara un movimiento opuesto ({entry.entry_type === 'credito' ? 'debito' : 'credito'}) por {formatCurrency(entry.amount)}.
            </p>
            <div>
              <Label className="mb-1">Motivo de la reversa *</Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="Ej: Error en el monto, duplicado..."
                className="resize-none"
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => { if (reason.trim()) onConfirm(reason); }}
            disabled={!reason.trim()}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            Confirmar Reversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LedgerEntryModal({
  clients,
  open,
  onOpenChange,
  onSave,
}: {
  clients: B2BClient[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [entryType, setEntryType] = useState<LedgerEntryType>('debito');
  const [category, setCategory] = useState<LedgerEntryCategory>('entrega');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const creditCategories: LedgerEntryCategory[] = ['deposito_verificado', 'ajuste_credito'];
  const debitCategories: LedgerEntryCategory[] = ['entrega', 'comision', 'ajuste_debito'];

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setClientId('');
      setEntryType('debito');
      setCategory('entrega');
      setAmount('');
      setDescription('');
      setReason('');
    }
  }, [open]);

  async function handleSave() {
    if (!clientId || !amount || !description) return;
    setSaving(true);

    if (isDemoMode()) { setSaving(false); onSave(); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('ledger_entries').insert({
      client_id: clientId, entry_type: entryType, category, amount: parseFloat(amount), description, reason: reason || null, created_by: user?.id,
    });

    await supabase.from('audit_events').insert({
      user_id: user?.id, action: 'ledger_entry_created', entity_type: 'ledger_entries',
      after_data: { client_id: clientId, entry_type: entryType, amount },
    });

    setSaving(false);
    onSave();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo Movimiento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1">Cliente *</Label>
            <Select
              value={clientId || '_none'}
              onValueChange={(v) => setClientId(v === '_none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Seleccionar cliente</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1">Tipo *</Label>
              <Select
                value={entryType}
                onValueChange={(v) => {
                  const t = v as LedgerEntryType;
                  setEntryType(t);
                  setCategory(t === 'credito' ? 'deposito_verificado' : 'entrega');
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito">Credito</SelectItem>
                  <SelectItem value="debito">Debito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Categoria *</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as LedgerEntryCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(entryType === 'credito' ? creditCategories : debitCategories).map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1">Monto *</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
            />
          </div>
          <div>
            <Label className="mb-1">Descripcion *</Label>
            <Input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Entrega efectivo, Comision marzo..."
            />
          </div>
          <div>
            <Label className="mb-1">Motivo (para ajustes)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={saving || !clientId || !amount || !description}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? 'Registrando...' : 'Registrar movimiento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
