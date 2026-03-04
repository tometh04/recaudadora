'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_ACCOUNTS, DEMO_BANK_TRANSACTIONS, DEMO_INBOX } from '@/lib/demo-data';
import {
  Landmark,
  Plus,
  Search,
  Edit2,
  X,
  ExternalLink,
  Upload,
  CheckCircle,
  FileSpreadsheet,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
} from 'lucide-react';
import { cn, formatDate, formatCurrency, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import type { Account, AccountType, BankTransaction, InboxItem } from '@/types/database';

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

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  banco: 'Banco',
  billetera: 'Billetera Virtual',
  proveedor_saldo_virtual: 'Proveedor Saldo Virtual',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  banco: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  billetera: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  proveedor_saldo_virtual: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'eliminar' | 'desactivar' | 'activar'; count: number } | null>(null);

  useEffect(() => { loadAccounts(); }, []);

  // Clear selection when search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search]);

  async function loadAccounts() {
    setLoading(true);
    if (isDemoMode()) { setAccounts(DEMO_ACCOUNTS); setLoading(false); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase.from('accounts').select('*').order('name', { ascending: true });
    setAccounts((data as Account[]) || []);
    setLoading(false);
  }

  const filtered = accounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.cbu?.includes(search)
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
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
  }

  async function handleBulkAction(action: 'eliminar' | 'desactivar' | 'activar') {
    const ids = Array.from(selectedIds);

    if (isDemoMode()) {
      if (action === 'eliminar') {
        setAccounts(prev => prev.filter(a => !selectedIds.has(a.id)));
      } else {
        const newActive = action === 'activar';
        setAccounts(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, is_active: newActive } : a));
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
      await supabase.from('inbox_items').update({ account_id: null }).in('account_id', ids);
      // Get bank_transaction IDs first to clean reconciliations
      const { data: txData } = await supabase.from('bank_transactions').select('id').in('account_id', ids);
      const txIds = (txData || []).map((t: { id: string }) => t.id);
      if (txIds.length > 0) {
        await supabase.from('reconciliations').delete().in('bank_transaction_id', txIds);
      }
      await supabase.from('bank_transactions').delete().in('account_id', ids);
      await supabase.from('statement_imports').delete().in('account_id', ids);
      const { error } = await supabase.from('accounts').delete().in('id', ids);
      if (error) {
        console.error('Error deleting accounts:', error);
        alert(`Error al eliminar: ${error.message}`);
        setBulkConfirm(null);
        return;
      }
    } else {
      const newActive = action === 'activar';
      await supabase.from('accounts').update({ is_active: newActive }).in('id', ids);
    }

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: `bulk_account_${action}`,
      entity_type: 'accounts',
      after_data: { account_ids: ids, count: ids.length },
    });

    setSelectedIds(new Set());
    setBulkConfirm(null);
    loadAccounts();
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="w-6 h-6 text-blue-400" />
            Cuentas / Canales
          </h1>
          <p className="text-muted-foreground mt-1">Bancos, billeteras y proveedores ({accounts.length})</p>
        </div>
        <Button onClick={() => { setEditingAccount(null); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> Nueva cuenta
        </Button>
      </div>

      {/* Search + Select All */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre, banco, CBU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay cuentas registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(account => (
            <Card
              key={account.id}
              className={cn(
                'hover:border-muted-foreground/30 transition cursor-pointer relative p-5',
                selectedIds.has(account.id) ? 'border-primary ring-1 ring-primary/30' : ''
              )}
            >
              {/* Checkbox */}
              <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(account.id)}
                  onCheckedChange={() => toggleSelect(account.id)}
                />
              </div>

              <div onClick={() => setSelectedAccount(account)} className="pl-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-foreground font-semibold">{account.name}</h3>
                    <Badge variant="outline" className={cn('mt-1', ACCOUNT_TYPE_COLORS[account.account_type])}>
                      {ACCOUNT_TYPE_LABELS[account.account_type]}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={e => { e.stopPropagation(); setEditingAccount(account); setShowForm(true); }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
                {account.bank_name && <p className="text-muted-foreground text-sm mb-1">{account.bank_name}</p>}
                {account.cbu && <p className="text-muted-foreground text-xs font-mono mb-1">CBU: {account.cbu}</p>}
                {account.alias && <p className="text-muted-foreground text-xs mb-1">Alias: {account.alias}</p>}
                {account.notes && <p className="text-muted-foreground text-xs mt-2">{account.notes}</p>}
                <Separator className="my-3" />
                <div className="flex justify-between">
                  <Badge variant="outline" className={account.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                    {account.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(account.created_at)}</span>
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
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
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
        entityLabel="cuentas"
        open={!!bulkConfirm}
        onConfirm={() => bulkConfirm && handleBulkAction(bulkConfirm.action)}
        onCancel={() => setBulkConfirm(null)}
      />

      {/* Detail */}
      <AccountDetailPanel
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
        onEdit={() => { if (selectedAccount) { setEditingAccount(selectedAccount); setShowForm(true); } }}
      />

      {/* Form */}
      <AccountFormModal
        open={showForm}
        account={editingAccount}
        onClose={() => { setShowForm(false); setEditingAccount(null); }}
        onSave={() => { setShowForm(false); setEditingAccount(null); loadAccounts(); }}
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
    eliminar: { title: `Eliminar ${entityLabel}`, icon: Trash2, description: `Se eliminaran ${count} ${entityLabel} y todos sus movimientos bancarios asociados. Esta accion es irreversible.` },
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

function AccountDetailPanel({ account, onClose, onEdit }: { account: Account | null; onClose: () => void; onEdit: () => void }) {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [balance, setBalance] = useState({ credits: 0, debits: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { if (account) loadData(); }, [account?.id]);

  async function loadData() {
    if (!account) return;
    setLoading(true);

    if (isDemoMode()) {
      const txs = DEMO_BANK_TRANSACTIONS.filter(t => t.account_id === account.id);
      setTransactions(txs.slice(0, 15));
      setInbox(DEMO_INBOX.filter(i => i.account_id === account.id).slice(0, 10));
      const credits = txs.filter(t => t.is_credit).reduce((s, t) => s + t.amount, 0);
      const debits = txs.filter(t => !t.is_credit).reduce((s, t) => s + t.amount, 0);
      setBalance({ credits, debits, total: credits - debits });
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [txRes, inboxRes, allTxRes, verifiedInboxRes, reconciledRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').eq('account_id', account.id).order('transaction_date', { ascending: false }).limit(15),
      supabase.from('inbox_items').select('*, client:b2b_clients(name)').eq('account_id', account.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('bank_transactions').select('amount, is_credit').eq('account_id', account.id),
      // Get all verified/aplicado inbox_items with amount for this account (for balance)
      supabase.from('inbox_items').select('id, amount').eq('account_id', account.id).in('status', ['verificado', 'aplicado']).not('amount', 'is', null),
      // Get reconciled inbox_item_ids to avoid double-counting
      supabase.from('reconciliations').select('inbox_item_id').eq('status', 'confirmado'),
    ]);

    setTransactions((txRes.data as BankTransaction[]) || []);
    setInbox((inboxRes.data as InboxItem[]) || []);

    // Bank transaction totals
    const allTx = (allTxRes.data || []) as { amount: number; is_credit: boolean }[];
    const txCredits = allTx.filter(t => t.is_credit).reduce((s, t) => s + t.amount, 0);
    const txDebits = allTx.filter(t => !t.is_credit).reduce((s, t) => s + t.amount, 0);

    // Verified comprobantes NOT yet reconciled (to avoid double-counting with bank_transactions)
    const reconciledIds = new Set((reconciledRes.data || []).map((r: { inbox_item_id: string }) => r.inbox_item_id));
    const unreconciled = (verifiedInboxRes.data || []).filter((i: { id: string; amount: number }) => !reconciledIds.has(i.id));
    const inboxCredits = unreconciled.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0);

    const credits = txCredits + inboxCredits;
    const debits = txDebits;
    setBalance({ credits, debits, total: credits - debits });
    setLoading(false);
  }

  async function handleImportCSV(file: File) {
    if (!account) return;
    if (isDemoMode()) { setShowImport(false); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;

    const { data: importRecord } = await supabase.from('statement_imports').insert({
      account_id: account.id, filename: file.name, rows_total: lines.length - 1, imported_by: user?.id,
    }).select().single();

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 2) continue;
      const dateIdx = headers.findIndex(h => h.includes('fecha') || h.includes('date'));
      const amountIdx = headers.findIndex(h => h.includes('monto') || h.includes('amount') || h.includes('importe'));
      const refIdx = headers.findIndex(h => h.includes('ref') || h.includes('comprobante'));
      const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('concepto'));
      const rawAmount = parseFloat((cols[amountIdx >= 0 ? amountIdx : 1] || '0').replace(/[^0-9.-]/g, ''));

      await supabase.from('bank_transactions').insert({
        account_id: account.id, import_id: importRecord?.id,
        transaction_date: cols[dateIdx >= 0 ? dateIdx : 0] || new Date().toISOString().split('T')[0],
        amount: Math.abs(rawAmount), is_credit: rawAmount > 0,
        reference: refIdx >= 0 ? cols[refIdx] : null, description: descIdx >= 0 ? cols[descIdx] : null,
        external_id: `${file.name}-${i}`, source: 'import', created_by: user?.id,
      });
      imported++;
    }

    if (importRecord) {
      await supabase.from('statement_imports').update({ rows_imported: imported }).eq('id', importRecord.id);
    }

    setShowImport(false);
    loadData();
  }

  return (
    <Sheet open={!!account} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl sm:max-w-2xl overflow-y-auto p-0" showCloseButton={false}>
        {account && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b border-border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-xl">{account.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={ACCOUNT_TYPE_COLORS[account.account_type]}>
                      {ACCOUNT_TYPE_LABELS[account.account_type]}
                    </Badge>
                    {account.cbu && <span className="text-muted-foreground text-xs font-mono">CBU: {account.cbu}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="w-5 h-5" /></Button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-5 space-y-6">
                {/* Account Info */}
                {(account.bank_name || account.alias || account.notes) && (
                  <div className="bg-muted/50 rounded-xl p-4 space-y-1">
                    {account.bank_name && <p className="text-muted-foreground text-sm">{account.bank_name}</p>}
                    {account.alias && <p className="text-muted-foreground text-xs">Alias: {account.alias}</p>}
                    {account.account_number && <p className="text-muted-foreground text-xs">Nro: {account.account_number}</p>}
                    {account.notes && <p className="text-muted-foreground text-xs italic pt-1">{account.notes}</p>}
                  </div>
                )}

                {/* Balance */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Balance</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Ingresos</p>
                      <p className="text-green-400 font-bold">{formatCurrency(balance.credits)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Egresos</p>
                      <p className="text-red-400 font-bold">{formatCurrency(balance.debits)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">SALDO</p>
                      <p className={cn('text-xl font-bold', balance.total >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {formatCurrency(balance.total)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Landmark className="w-4 h-4" /> Movimientos Bancarios
                    </h3>
                    <a href="/reconciliation" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      Conciliar <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {transactions.length === 0 ? (
                    <p className="text-muted-foreground text-xs text-center py-4">Sin movimientos</p>
                  ) : (
                    <div className="space-y-1.5">
                      {transactions.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-foreground text-xs truncate max-w-[200px]">{tx.description || tx.reference || 'Movimiento'}</p>
                              <p className="text-muted-foreground text-[10px]">{formatDate(tx.transaction_date)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-sm font-mono font-medium', tx.is_credit ? 'text-green-400' : 'text-red-400')}>
                              {tx.is_credit ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                            {tx.is_reconciled && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comprobantes */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" /> Comprobantes
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
                            <span className="text-muted-foreground text-xs">{(item.client as any)?.name || ''}</span>
                          </div>
                          <span className="text-foreground text-xs font-mono">{item.amount ? formatCurrency(item.amount) : '\u2014'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Import */}
                <Button onClick={() => setShowImport(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Upload className="w-4 h-4" /> Importar Movimientos
                </Button>
              </div>
            )}

            {/* Import Modal */}
            <Dialog open={showImport} onOpenChange={(o) => !o && setShowImport(false)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Importar CSV</DialogTitle>
                  <DialogDescription>Formato: fecha, monto, referencia, descripcion</DialogDescription>
                </DialogHeader>
                <label className="flex items-center justify-center p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-muted-foreground/50 transition">
                  <div className="text-center">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Seleccionar archivo CSV</p>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); }} />
                </label>
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AccountFormModal({ open, account, onClose, onSave }: { open: boolean; account: Account | null; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<AccountType>(account?.account_type || 'banco');
  const [bankName, setBankName] = useState(account?.bank_name || '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number || '');
  const [cbu, setCbu] = useState(account?.cbu || '');
  const [alias, setAlias] = useState(account?.alias || '');
  const [notes, setNotes] = useState(account?.notes || '');
  const [saving, setSaving] = useState(false);

  // Reset form when account changes
  useEffect(() => {
    setName(account?.name || '');
    setAccountType(account?.account_type || 'banco');
    setBankName(account?.bank_name || '');
    setAccountNumber(account?.account_number || '');
    setCbu(account?.cbu || '');
    setAlias(account?.alias || '');
    setNotes(account?.notes || '');
  }, [account]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    if (isDemoMode()) { setSaving(false); onSave(); return; }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const data = { name, account_type: accountType, bank_name: bankName || null, account_number: accountNumber || null, cbu: cbu || null, alias: alias || null, notes: notes || null };

    if (account) { await supabase.from('accounts').update(data).eq('id', account.id); }
    else { await supabase.from('accounts').insert(data); }

    setSaving(false);
    onSave();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre interno *</Label>
            <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Macro Pesos, MercadoPago..." />
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="billetera">Billetera Virtual</SelectItem>
                <SelectItem value="proveedor_saldo_virtual">Proveedor Saldo Virtual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {accountType === 'banco' && (
            <>
              <div>
                <Label>Banco</Label>
                <Input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Banco Macro, Credicoop..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nro. Cuenta</Label>
                  <Input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                </div>
                <div>
                  <Label>CBU</Label>
                  <Input type="text" value={cbu} onChange={e => setCbu(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Alias</Label>
                <Input type="text" value={alias} onChange={e => setAlias(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none" />
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? 'Guardando...' : account ? 'Actualizar' : 'Crear cuenta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
