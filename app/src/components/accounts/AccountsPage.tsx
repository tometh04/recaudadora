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

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  banco: 'Banco',
  billetera: 'Billetera Virtual',
  proveedor_saldo_virtual: 'Proveedor Saldo Virtual',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  banco: 'bg-blue-500/10 text-blue-400',
  billetera: 'bg-purple-500/10 text-purple-400',
  proveedor_saldo_virtual: 'bg-orange-500/10 text-orange-400',
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark className="w-6 h-6 text-blue-400" />
            Cuentas / Canales
          </h1>
          <p className="text-slate-400 mt-1">Bancos, billeteras y proveedores ({accounts.length})</p>
        </div>
        <button onClick={() => { setEditingAccount(null); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
          <Plus className="w-4 h-4" /> Nueva cuenta
        </button>
      </div>

      {/* Search + Select All */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Buscar por nombre, banco, CBU..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
              allSelected || someSelected
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
            )}
          >
            <CheckSquare className="w-4 h-4" />
            {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay cuentas registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(account => (
            <div
              key={account.id}
              className={cn(
                'bg-slate-900/50 border rounded-xl p-5 hover:border-slate-600 transition cursor-pointer relative',
                selectedIds.has(account.id) ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-800'
              )}
            >
              {/* Checkbox */}
              <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(account.id)}
                  onChange={() => toggleSelect(account.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
              </div>

              <div onClick={() => setSelectedAccount(account)} className="pl-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold">{account.name}</h3>
                    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-medium mt-1', ACCOUNT_TYPE_COLORS[account.account_type])}>
                      {ACCOUNT_TYPE_LABELS[account.account_type]}
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setEditingAccount(account); setShowForm(true); }}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
                {account.bank_name && <p className="text-slate-400 text-sm mb-1">{account.bank_name}</p>}
                {account.cbu && <p className="text-slate-500 text-xs font-mono mb-1">CBU: {account.cbu}</p>}
                {account.alias && <p className="text-slate-500 text-xs mb-1">Alias: {account.alias}</p>}
                {account.notes && <p className="text-slate-600 text-xs mt-2">{account.notes}</p>}
                <div className="border-t border-slate-800 pt-3 mt-3 flex justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded ${account.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {account.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                  <span className="text-xs text-slate-600">{formatDate(account.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4">
          <span className="text-white text-sm font-medium">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="w-px h-6 bg-slate-700" />
          <button
            onClick={() => setBulkConfirm({ action: 'activar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition"
          >
            <ToggleRight className="w-4 h-4" />
            Activar
          </button>
          <button
            onClick={() => setBulkConfirm({ action: 'desactivar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition"
          >
            <ToggleLeft className="w-4 h-4" />
            Desactivar
          </button>
          <button
            onClick={() => setBulkConfirm({ action: 'eliminar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Confirm Dialog */}
      {bulkConfirm && (
        <BulkConfirmDialog
          action={bulkConfirm.action}
          count={bulkConfirm.count}
          entityLabel="cuentas"
          onConfirm={() => handleBulkAction(bulkConfirm.action)}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      {/* Detail */}
      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onEdit={() => { setEditingAccount(selectedAccount); setShowForm(true); }}
        />
      )}

      {/* Form */}
      {showForm && (
        <AccountFormModal
          account={editingAccount}
          onClose={() => { setShowForm(false); setEditingAccount(null); }}
          onSave={() => { setShowForm(false); setEditingAccount(null); loadAccounts(); }}
        />
      )}
    </div>
  );
}

function BulkConfirmDialog({
  action, count, entityLabel, onConfirm, onCancel,
}: {
  action: string; count: number; entityLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const configs: Record<string, { title: string; color: string; icon: typeof Trash2; description: string }> = {
    eliminar: { title: `Eliminar ${entityLabel}`, color: 'bg-red-600 hover:bg-red-700', icon: Trash2, description: `Se eliminaran ${count} ${entityLabel} y todos sus movimientos bancarios asociados. Esta accion es irreversible.` },
    desactivar: { title: `Desactivar ${entityLabel}`, color: 'bg-orange-600 hover:bg-orange-700', icon: ToggleLeft, description: `Se desactivaran ${count} ${entityLabel}. No se eliminan datos, solo se ocultan de las listas.` },
    activar: { title: `Activar ${entityLabel}`, color: 'bg-green-600 hover:bg-green-700', icon: ToggleRight, description: `Se activaran ${count} ${entityLabel}.` },
  };
  const config = configs[action] || configs.eliminar;
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm m-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', action === 'eliminar' ? 'bg-red-500/10' : action === 'desactivar' ? 'bg-orange-500/10' : 'bg-green-500/10')}>
            <Icon className={cn('w-5 h-5', action === 'eliminar' ? 'text-red-400' : action === 'desactivar' ? 'text-orange-400' : 'text-green-400')} />
          </div>
          <h3 className="text-lg font-semibold text-white">{config.title}</h3>
        </div>
        <p className="text-slate-400 text-sm mb-6">{config.description}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition">
            Cancelar
          </button>
          <button onClick={onConfirm} className={cn('flex-1 py-2 text-white text-sm font-medium rounded-lg transition', config.color)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountDetailPanel({ account, onClose, onEdit }: { account: Account; onClose: () => void; onEdit: () => void }) {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [balance, setBalance] = useState({ credits: 0, debits: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { loadData(); }, [account.id]);

  async function loadData() {
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

    const [txRes, inboxRes, allTxRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').eq('account_id', account.id).order('transaction_date', { ascending: false }).limit(15),
      supabase.from('inbox_items').select('*, client:b2b_clients(name)').eq('account_id', account.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('bank_transactions').select('amount, is_credit').eq('account_id', account.id),
    ]);

    setTransactions((txRes.data as BankTransaction[]) || []);
    setInbox((inboxRes.data as InboxItem[]) || []);

    const all = (allTxRes.data || []) as { amount: number; is_credit: boolean }[];
    const credits = all.filter(t => t.is_credit).reduce((s, t) => s + t.amount, 0);
    const debits = all.filter(t => !t.is_credit).reduce((s, t) => s + t.amount, 0);
    setBalance({ credits, debits, total: credits - debits });
    setLoading(false);
  }

  async function handleImportCSV(file: File) {
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-700 h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{account.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('px-2 py-0.5 rounded text-xs font-medium', ACCOUNT_TYPE_COLORS[account.account_type])}>
                  {ACCOUNT_TYPE_LABELS[account.account_type]}
                </span>
                {account.cbu && <span className="text-slate-500 text-xs font-mono">CBU: {account.cbu}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"><Edit2 className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"><X className="w-5 h-5" /></button>
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
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-1">
                {account.bank_name && <p className="text-slate-300 text-sm">{account.bank_name}</p>}
                {account.alias && <p className="text-slate-500 text-xs">Alias: {account.alias}</p>}
                {account.account_number && <p className="text-slate-500 text-xs">Nro: {account.account_number}</p>}
                {account.notes && <p className="text-slate-500 text-xs italic pt-1">{account.notes}</p>}
              </div>
            )}

            {/* Balance */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-400 mb-3">Balance</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-slate-500">Ingresos</p>
                  <p className="text-green-400 font-bold">{formatCurrency(balance.credits)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Egresos</p>
                  <p className="text-red-400 font-bold">{formatCurrency(balance.debits)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">SALDO</p>
                  <p className={cn('text-xl font-bold', balance.total >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {formatCurrency(balance.total)}
                  </p>
                </div>
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <Landmark className="w-4 h-4" /> Movimientos Bancarios
                </h3>
                <a href="/reconciliation" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  Conciliar <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {transactions.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-4">Sin movimientos</p>
              ) : (
                <div className="space-y-1.5">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/30">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-white text-xs truncate max-w-[200px]">{tx.description || tx.reference || 'Movimiento'}</p>
                          <p className="text-slate-500 text-[10px]">{formatDate(tx.transaction_date)}</p>
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
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" /> Comprobantes
                </h3>
                <a href="/inbox" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  Ver todos <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {inbox.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-4">Sin comprobantes</p>
              ) : (
                <div className="space-y-1.5">
                  {inbox.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/30">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px] font-mono">{item.id.slice(0, 8)}</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_COLORS[item.status])}>
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="text-slate-400 text-xs">{(item.client as any)?.name || ''}</span>
                      </div>
                      <span className="text-white text-xs font-mono">{item.amount ? formatCurrency(item.amount) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Import */}
            <button onClick={() => setShowImport(true)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" /> Importar Movimientos
            </button>
          </div>
        )}

        {/* Import Modal */}
        {showImport && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md m-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Importar CSV</h3>
                <button onClick={() => setShowImport(false)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-slate-500 mb-3">Formato: fecha, monto, referencia, descripcion</p>
              <label className="flex items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-slate-600 transition">
                <div className="text-center">
                  <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-300 text-sm">Seleccionar archivo CSV</p>
                </div>
                <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); }} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountFormModal({ account, onClose, onSave }: { account: Account | null; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<AccountType>(account?.account_type || 'banco');
  const [bankName, setBankName] = useState(account?.bank_name || '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number || '');
  const [cbu, setCbu] = useState(account?.cbu || '');
  const [alias, setAlias] = useState(account?.alias || '');
  const [notes, setNotes] = useState(account?.notes || '');
  const [saving, setSaving] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{account ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre interno *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Macro Pesos, MercadoPago..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Tipo *</label>
            <select value={accountType} onChange={e => setAccountType(e.target.value as AccountType)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="banco">Banco</option>
              <option value="billetera">Billetera Virtual</option>
              <option value="proveedor_saldo_virtual">Proveedor Saldo Virtual</option>
            </select>
          </div>
          {accountType === 'banco' && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Banco</label>
                <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Banco Macro, Credicoop..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Nro. Cuenta</label>
                  <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">CBU</label>
                  <input type="text" value={cbu} onChange={e => setCbu(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Alias</label>
                <input type="text" value={alias} onChange={e => setAlias(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {saving ? 'Guardando...' : account ? 'Actualizar' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}
