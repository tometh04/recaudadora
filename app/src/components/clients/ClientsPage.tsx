'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS, DEMO_LEDGER, DEMO_INBOX, DEMO_CLIENT_BALANCES } from '@/lib/demo-data';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Phone,
  Mail,
  X,
  Building2,
  ArrowUpCircle,
  ArrowDownCircle,
  ExternalLink,
  FileCheck,
  BookOpen,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
} from 'lucide-react';
import { cn, formatDate, formatCurrency, formatDateTime, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import type { B2BClient, ClientPhone, LedgerEntry, InboxItem, ClientBalance, LedgerEntryType, LedgerEntryCategory } from '@/types/database';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const DEMO_PHONES: Record<string, ClientPhone[]> = {
  'client-1': [
    { id: 'ph-1', client_id: 'client-1', phone_number: '+5493415551001', label: null, is_active: true, created_at: '2025-01-20T10:00:00Z' },
    { id: 'ph-2', client_id: 'client-1', phone_number: '+5493415551002', label: null, is_active: true, created_at: '2025-01-20T10:00:00Z' },
  ],
  'client-2': [
    { id: 'ph-3', client_id: 'client-2', phone_number: '+5493415552002', label: null, is_active: true, created_at: '2025-02-01T10:00:00Z' },
  ],
  'client-3': [
    { id: 'ph-4', client_id: 'client-3', phone_number: '+5493415553003', label: null, is_active: true, created_at: '2025-02-15T10:00:00Z' },
  ],
  'client-4': [
    { id: 'ph-5', client_id: 'client-4', phone_number: '+5493415554004', label: null, is_active: true, created_at: '2025-03-01T10:00:00Z' },
  ],
};

const CATEGORY_LABELS: Record<LedgerEntryCategory, string> = {
  deposito_verificado: 'Deposito',
  entrega: 'Entrega',
  comision: 'Comision',
  ajuste_credito: 'Ajuste +',
  ajuste_debito: 'Ajuste -',
  reversa: 'Reversa',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [phones, setPhones] = useState<Record<string, ClientPhone[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<B2BClient | null>(null);
  const [selectedClient, setSelectedClient] = useState<B2BClient | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'eliminar' | 'desactivar' | 'activar'; count: number } | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  // Clear selection when search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search]);

  async function loadClients() {
    setLoading(true);

    if (isDemoMode()) {
      setClients(DEMO_CLIENTS);
      setPhones(DEMO_PHONES);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [clientsRes, phonesRes] = await Promise.all([
      supabase.from('b2b_clients').select('*').order('name', { ascending: true }),
      supabase.from('client_phones').select('*').eq('is_active', true),
    ]);

    setClients((clientsRes.data as B2BClient[]) || []);

    const phoneMap: Record<string, ClientPhone[]> = {};
    (phonesRes.data || []).forEach((p: ClientPhone) => {
      if (!phoneMap[p.client_id]) phoneMap[p.client_id] = [];
      phoneMap[p.client_id].push(p);
    });
    setPhones(phoneMap);
    setLoading(false);
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.business_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.tax_id?.includes(search)
  );

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }

  async function handleBulkAction(action: 'eliminar' | 'desactivar' | 'activar') {
    const ids = Array.from(selectedIds);

    if (isDemoMode()) {
      if (action === 'eliminar') {
        setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
      } else {
        const newActive = action === 'activar';
        setClients(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, is_active: newActive } : c));
      }
      setSelectedIds(new Set());
      setBulkConfirm(null);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (action === 'eliminar') {
      // Clean FK dependencies
      await supabase.from('client_phones').delete().in('client_id', ids);
      await supabase.from('inbox_items').update({ client_id: null }).in('client_id', ids);
      await supabase.from('ledger_entries').update({ client_id: null } as any).in('client_id', ids);
      const { error } = await supabase.from('b2b_clients').delete().in('id', ids);
      if (error) {
        console.error('Error deleting clients:', error);
        alert(`Error al eliminar: ${error.message}`);
        setBulkConfirm(null);
        return;
      }
    } else {
      const newActive = action === 'activar';
      await supabase.from('b2b_clients').update({ is_active: newActive }).in('id', ids);
    }

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: `bulk_client_${action}`,
      entity_type: 'b2b_clients',
      after_data: { client_ids: ids, count: ids.length },
    });

    setSelectedIds(new Set());
    setBulkConfirm(null);
    loadClients();
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Clientes B2B
          </h1>
          <p className="text-muted-foreground mt-1">
            Mutuales y empresas ({clients.length})
          </p>
        </div>
        <Button
          onClick={() => { setEditingClient(null); setShowForm(true); }}
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Search + Select All */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre, razon social, CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        {filtered.length > 0 && (
          <Button
            variant="outline"
            onClick={toggleSelectAll}
            className={cn(
              allSelected || someSelected
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                : ''
            )}
          >
            <CheckSquare className="w-4 h-4" />
            {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </Button>
        )}
      </div>

      {/* Client Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay clientes registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Card
              key={client.id}
              className={cn(
                'hover:border-muted-foreground/30 transition cursor-pointer relative p-5',
                selectedIds.has(client.id) ? 'border-primary ring-1 ring-primary/30' : ''
              )}
            >
              {/* Checkbox */}
              <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(client.id)}
                  onCheckedChange={() => toggleSelect(client.id)}
                />
              </div>

              <div onClick={() => setSelectedClient(client)} className="pl-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-foreground font-semibold">{client.name}</h3>
                    {client.business_name && (
                      <p className="text-muted-foreground text-xs">{client.business_name}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => { e.stopPropagation(); setEditingClient(client); setShowForm(true); }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>

                {client.tax_id && (
                  <p className="text-muted-foreground text-xs mb-2">CUIT: {client.tax_id}</p>
                )}

                <div className="space-y-1 mb-3">
                  {client.contact_email && (
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {client.contact_email}
                    </p>
                  )}
                  {client.contact_phone && (
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {client.contact_phone}
                    </p>
                  )}
                </div>

                {phones[client.id] && phones[client.id].length > 0 && (
                  <div>
                    <Separator className="mb-3" />
                    <p className="text-muted-foreground text-xs mb-1.5">WhatsApp:</p>
                    <div className="flex flex-wrap gap-1">
                      {phones[client.id].map((p) => (
                        <Badge key={p.id} variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                          {p.phone_number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="my-3" />
                <div className="flex justify-between">
                  <Badge variant="outline" className={client.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                    {client.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(client.created_at)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-muted border border-border rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4">
          <span className="text-foreground text-sm font-medium">
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="w-px h-6 bg-border" />
          <Button
            size="sm"
            onClick={() => setBulkConfirm({ action: 'activar', count: selectedIds.size })}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <ToggleRight className="w-4 h-4" />
            Activar
          </Button>
          <Button
            size="sm"
            onClick={() => setBulkConfirm({ action: 'desactivar', count: selectedIds.size })}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <ToggleLeft className="w-4 h-4" />
            Desactivar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkConfirm({ action: 'eliminar', count: selectedIds.size })}
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Bulk Confirm Dialog */}
      <BulkConfirmDialog
        action={bulkConfirm?.action || 'eliminar'}
        count={bulkConfirm?.count || 0}
        entityLabel="clientes"
        open={!!bulkConfirm}
        onConfirm={() => bulkConfirm && handleBulkAction(bulkConfirm.action)}
        onCancel={() => setBulkConfirm(null)}
      />

      {/* Client Detail Slide-Out */}
      <ClientDetailPanel
        client={selectedClient}
        clientPhones={selectedClient ? phones[selectedClient.id] || [] : []}
        onClose={() => setSelectedClient(null)}
        onEdit={() => { if (selectedClient) { setEditingClient(selectedClient); setShowForm(true); } }}
      />

      {/* Form Modal */}
      <ClientFormModal
        open={showForm}
        client={editingClient}
        existingPhones={editingClient ? phones[editingClient.id] || [] : []}
        onClose={() => { setShowForm(false); setEditingClient(null); }}
        onSave={() => { setShowForm(false); setEditingClient(null); loadClients(); }}
      />
    </div>
  );
}

function BulkConfirmDialog({
  action, count, entityLabel, open, onConfirm, onCancel,
}: {
  action: string; count: number; entityLabel: string; open: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const configs: Record<string, { title: string; icon: typeof Trash2; description: string }> = {
    eliminar: { title: `Eliminar ${entityLabel}`, icon: Trash2, description: `Se eliminaran ${count} ${entityLabel} de forma permanente. Los movimientos asociados quedaran sin cliente. Esta accion es irreversible.` },
    desactivar: { title: `Desactivar ${entityLabel}`, icon: ToggleLeft, description: `Se desactivaran ${count} ${entityLabel}. No se eliminan datos, solo se ocultan de las listas.` },
    activar: { title: `Activar ${entityLabel}`, icon: ToggleRight, description: `Se activaran ${count} ${entityLabel}.` },
  };
  const config = configs[action] || configs.eliminar;
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', action === 'eliminar' ? 'bg-red-500/10' : action === 'desactivar' ? 'bg-orange-500/10' : 'bg-green-500/10')}>
              <Icon className={cn('w-5 h-5', action === 'eliminar' ? 'text-red-400' : action === 'desactivar' ? 'text-orange-400' : 'text-green-400')} />
            </div>
            <DialogTitle>{config.title}</DialogTitle>
          </div>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant={action === 'eliminar' ? 'destructive' : 'default'}
            onClick={onConfirm}
            className={cn('flex-1', action === 'activar' && 'bg-green-600 hover:bg-green-700 text-white', action === 'desactivar' && 'bg-orange-600 hover:bg-orange-700 text-white')}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientDetailPanel({
  client,
  clientPhones,
  onClose,
  onEdit,
}: {
  client: B2BClient | null;
  clientPhones: ClientPhone[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [balance, setBalance] = useState<ClientBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewEntry, setShowNewEntry] = useState(false);

  useEffect(() => {
    if (client) loadClientData();
  }, [client?.id]);

  async function loadClientData() {
    if (!client) return;
    setLoading(true);

    if (isDemoMode()) {
      setLedger(DEMO_LEDGER.filter(e => e.client_id === client.id).slice(0, 10));
      setInbox(DEMO_INBOX.filter(i => i.client_id === client.id).slice(0, 10));
      const bal = DEMO_CLIENT_BALANCES.find(b => b.client_id === client.id);
      setBalance(bal || null);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [ledgerRes, inboxRes, balanceRes] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('*, creator:profiles(full_name)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('inbox_items')
        .select('*, account:accounts(name)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('v_client_balances')
        .select('*')
        .eq('client_id', client.id)
        .maybeSingle(),
    ]);

    setLedger((ledgerRes.data as LedgerEntry[]) || []);
    setInbox((inboxRes.data as InboxItem[]) || []);
    setBalance(balanceRes.data as ClientBalance | null);
    setLoading(false);
  }

  async function handleCreateEntry(data: { entryType: LedgerEntryType; category: LedgerEntryCategory; amount: number; description: string; reason: string }) {
    if (!client) return;
    if (isDemoMode()) { setShowNewEntry(false); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('ledger_entries').insert({
      client_id: client.id,
      entry_type: data.entryType,
      category: data.category,
      amount: data.amount,
      description: data.description,
      reason: data.reason || null,
      created_by: user?.id,
    });

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'ledger_entry_created',
      entity_type: 'ledger_entries',
      after_data: { client_id: client.id, entry_type: data.entryType, amount: data.amount },
    });

    setShowNewEntry(false);
    loadClientData();
  }

  return (
    <Sheet open={!!client} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl sm:max-w-2xl overflow-y-auto p-0" showCloseButton={false}>
        {client && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b border-border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-xl">{client.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {client.tax_id && <span className="text-muted-foreground text-xs">CUIT: {client.tax_id}</span>}
                    <Badge variant="outline" className={client.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                      {client.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={onEdit}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={onClose}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-5 space-y-6">
                {/* Client Info */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  {client.business_name && (
                    <p className="text-muted-foreground text-sm"><span className="text-muted-foreground">Razon Social:</span> {client.business_name}</p>
                  )}
                  {client.contact_email && (
                    <p className="text-muted-foreground text-sm flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {client.contact_email}</p>
                  )}
                  {client.contact_phone && (
                    <p className="text-muted-foreground text-sm flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {client.contact_phone}</p>
                  )}
                  {clientPhones.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {clientPhones.map(p => (
                        <Badge key={p.id} variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">{p.phone_number}</Badge>
                      ))}
                    </div>
                  )}
                  {client.notes && <p className="text-muted-foreground text-xs italic pt-1">{client.notes}</p>}
                </div>

                {/* Balance */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Saldo</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Credito</p>
                      <p className="text-green-400 font-bold">{formatCurrency(balance?.total_credito || 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Debito</p>
                      <p className="text-red-400 font-bold">{formatCurrency(balance?.total_debito || 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">SALDO</p>
                      <p className={cn('text-xl font-bold', (balance?.saldo || 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {formatCurrency(balance?.saldo || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recent Ledger */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Ultimos Movimientos
                    </h3>
                    <a href="/ledger" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      Ver todos <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {ledger.length === 0 ? (
                    <p className="text-muted-foreground text-xs text-center py-4">Sin movimientos</p>
                  ) : (
                    <div className="space-y-1.5">
                      {ledger.map(entry => (
                        <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                          <div className="flex items-center gap-2">
                            {entry.entry_type === 'credito' ? (
                              <ArrowUpCircle className="w-4 h-4 text-green-400 shrink-0" />
                            ) : (
                              <ArrowDownCircle className="w-4 h-4 text-red-400 shrink-0" />
                            )}
                            <div>
                              <p className="text-foreground text-xs">{CATEGORY_LABELS[entry.category]}</p>
                              <p className="text-muted-foreground text-[10px]">{formatDate(entry.created_at)}</p>
                            </div>
                          </div>
                          <span className={cn('text-sm font-mono font-medium', entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400')}>
                            {entry.entry_type === 'credito' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Comprobantes */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileCheck className="w-4 h-4" />
                      Comprobantes Recientes
                    </h3>
                    <a href="/inbox" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      Ver todos <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {inbox.length === 0 ? (
                    <p className="text-muted-foreground text-xs text-center py-4">Sin comprobantes</p>
                  ) : (
                    <div className="space-y-1.5">
                      {inbox.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-[10px] font-mono">{item.id.slice(0, 8)}</span>
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_COLORS[item.status])}>
                              {STATUS_LABELS[item.status]}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-foreground text-xs font-mono">{item.amount ? formatCurrency(item.amount) : '\u2014'}</p>
                            <p className="text-muted-foreground text-[10px]">{item.transaction_date || formatDate(item.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Action */}
                <Button
                  onClick={() => setShowNewEntry(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Movimiento
                </Button>
              </div>
            )}

            {/* Inline New Entry Modal */}
            <QuickLedgerEntryModal
              open={showNewEntry}
              clientName={client.name}
              onClose={() => setShowNewEntry(false)}
              onSave={handleCreateEntry}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function QuickLedgerEntryModal({
  open,
  clientName,
  onClose,
  onSave,
}: {
  open: boolean;
  clientName: string;
  onClose: () => void;
  onSave: (data: { entryType: LedgerEntryType; category: LedgerEntryCategory; amount: number; description: string; reason: string }) => void;
}) {
  const [entryType, setEntryType] = useState<LedgerEntryType>('debito');
  const [category, setCategory] = useState<LedgerEntryCategory>('entrega');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');

  const creditCats: LedgerEntryCategory[] = ['deposito_verificado', 'ajuste_credito'];
  const debitCats: LedgerEntryCategory[] = ['entrega', 'comision', 'ajuste_debito'];
  const CATS: Record<LedgerEntryCategory, string> = {
    deposito_verificado: 'Deposito Verificado', entrega: 'Entrega', comision: 'Comision',
    ajuste_credito: 'Ajuste Credito', ajuste_debito: 'Ajuste Debito', reversa: 'Reversa',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Movimiento</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={entryType}
                onValueChange={(v) => { const t = v as LedgerEntryType; setEntryType(t); setCategory(t === 'credito' ? 'deposito_verificado' : 'entrega'); }}
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
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as LedgerEntryCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(entryType === 'credito' ? creditCats : debitCats).map(c => (
                    <SelectItem key={c} value={c}>{CATS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Monto</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs">Descripcion</Label>
            <Input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Entrega efectivo" />
          </div>
          <div>
            <Label className="text-xs">Motivo (opcional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="resize-none" />
          </div>
          <Button
            onClick={() => { if (amount && description) onSave({ entryType, category, amount: parseFloat(amount), description, reason }); }}
            disabled={!amount || !description}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Registrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClientFormModal({
  open, client, existingPhones, onClose, onSave,
}: {
  open: boolean; client: B2BClient | null; existingPhones: ClientPhone[]; onClose: () => void; onSave: () => void;
}) {
  const [name, setName] = useState(client?.name || '');
  const [businessName, setBusinessName] = useState(client?.business_name || '');
  const [taxId, setTaxId] = useState(client?.tax_id || '');
  const [email, setEmail] = useState(client?.contact_email || '');
  const [phone, setPhone] = useState(client?.contact_phone || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [waPhones, setWaPhones] = useState<string[]>(existingPhones.map(p => p.phone_number));
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset form when client changes
  useEffect(() => {
    setName(client?.name || '');
    setBusinessName(client?.business_name || '');
    setTaxId(client?.tax_id || '');
    setEmail(client?.contact_email || '');
    setPhone(client?.contact_phone || '');
    setNotes(client?.notes || '');
    setWaPhones(existingPhones.map(p => p.phone_number));
    setNewPhone('');
  }, [client, existingPhones]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    if (isDemoMode()) { setSaving(false); onSave(); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const data = {
      name, business_name: businessName || null, tax_id: taxId || null,
      contact_email: email || null, contact_phone: phone || null, notes: notes || null,
    };

    let clientId = client?.id;
    if (client) {
      await supabase.from('b2b_clients').update(data).eq('id', client.id);
    } else {
      const { data: newClient } = await supabase.from('b2b_clients').insert(data).select().single();
      clientId = newClient?.id;
    }

    if (clientId) {
      await supabase.from('client_phones').delete().eq('client_id', clientId);
      if (waPhones.length > 0) {
        await supabase.from('client_phones').insert(waPhones.map(p => ({ client_id: clientId, phone_number: p })));
      }
    }

    setSaving(false);
    onSave();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input type="text" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Razon Social</Label>
            <Input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CUIT</Label>
              <Input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} />
            </div>
            <div>
              <Label>Telefono</Label>
              <Input type="text" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div>
            <Label>Telefonos WhatsApp</Label>
            <div className="flex gap-2 mb-2">
              <Input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+5493411234567" className="flex-1"
                onKeyDown={e => { if (e.key === 'Enter' && newPhone.trim()) { setWaPhones([...waPhones, newPhone.trim()]); setNewPhone(''); } }}
              />
              <Button type="button" onClick={() => { if (newPhone.trim()) { setWaPhones([...waPhones, newPhone.trim()]); setNewPhone(''); } }} className="bg-green-600 hover:bg-green-700 text-white" size="default">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {waPhones.map((p, i) => (
                <Badge key={i} variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 gap-1">
                  {p}
                  <button onClick={() => setWaPhones(waPhones.filter((_, j) => j !== i))} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? 'Guardando...' : client ? 'Actualizar' : 'Crear cliente'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
