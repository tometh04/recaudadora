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
  X,
  RotateCcw,
  Download,
  Filter,
} from 'lucide-react';
import { cn, formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import type {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryCategory,
  B2BClient,
  ClientBalance,
} from '@/types/database';

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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            Cuenta Corriente
          </h1>
          <p className="text-slate-400 mt-1">Ledger auditable por cliente B2B</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition">
            <Plus className="w-4 h-4" /> Nuevo movimiento
          </button>
        </div>
      </div>

      {/* Balances */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {balances.slice(0, 8).map(b => (
            <div key={b.client_id} onClick={() => setSelectedClient(b.client_id)}
              className={cn('p-4 rounded-xl border cursor-pointer transition',
                selectedClient === b.client_id ? 'bg-emerald-900/20 border-emerald-700' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700')}>
              <p className="text-sm text-slate-400 truncate">{b.client_name}</p>
              <p className={cn('text-lg font-bold mt-1', b.saldo >= 0 ? 'text-green-400' : 'text-red-400')}>{formatCurrency(b.saldo)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="todos">Todos los clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as LedgerEntryCategory | 'todas')}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="todas">Todas las categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="Desde"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <span className="text-slate-500 text-xs">a</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Hasta"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Buscar por descripcion..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left p-4 text-slate-400 font-medium">Fecha</th>
                <th className="text-left p-4 text-slate-400 font-medium">Cliente</th>
                <th className="text-left p-4 text-slate-400 font-medium">Tipo</th>
                <th className="text-left p-4 text-slate-400 font-medium">Categoria</th>
                <th className="text-left p-4 text-slate-400 font-medium">Descripcion</th>
                <th className="text-right p-4 text-slate-400 font-medium">Monto</th>
                <th className="text-left p-4 text-slate-400 font-medium">Usuario</th>
                <th className="text-left p-4 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No hay movimientos</td></tr>
              ) : (
                filtered.map(entry => {
                  const isReversed = reversedIds.has(entry.id);
                  const isReversa = entry.category === 'reversa';

                  return (
                    <tr key={entry.id} className={cn('border-b border-slate-800/50 hover:bg-slate-800/30', isReversed && 'opacity-50')}>
                      <td className="p-4 text-slate-300 text-xs whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                      <td className="p-4 text-white">{(entry.client as unknown as { name: string })?.name}</td>
                      <td className="p-4">
                        <span className="flex items-center gap-1">
                          {entry.entry_type === 'credito' ? <ArrowUpCircle className="w-4 h-4 text-green-400" /> : <ArrowDownCircle className="w-4 h-4 text-red-400" />}
                          <span className={entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400'}>
                            {entry.entry_type === 'credito' ? 'Credito' : 'Debito'}
                          </span>
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('px-2 py-0.5 rounded text-xs', isReversa ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-800 text-slate-300')}>
                            {CATEGORY_LABELS[entry.category]}
                          </span>
                          {isReversed && (
                            <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded text-[10px]">Reversado</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-300 max-w-xs truncate">{entry.description}</td>
                      <td className={cn('p-4 text-right font-mono font-medium', entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400')}>
                        {entry.entry_type === 'credito' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </td>
                      <td className="p-4 text-slate-500 text-xs">{(entry.creator as unknown as { full_name: string })?.full_name}</td>
                      <td className="p-4">
                        {!isReversa && !isReversed && (
                          <button onClick={() => setReversalEntry(entry)}
                            className="p-1.5 rounded hover:bg-orange-900/30 text-slate-400 hover:text-orange-400 transition" title="Reversar">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reversal Modal */}
      {reversalEntry && (
        <ReversalModal
          entry={reversalEntry}
          onConfirm={(reason) => handleReversal(reversalEntry, reason)}
          onCancel={() => setReversalEntry(null)}
        />
      )}

      {/* New Entry Modal */}
      {showForm && (
        <LedgerEntryModal clients={clients} onClose={() => setShowForm(false)} onSave={() => { setShowForm(false); loadData(); }} />
      )}
    </div>
  );
}

function ReversalModal({ entry, onConfirm, onCancel }: { entry: LedgerEntry; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md m-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-orange-500/10"><RotateCcw className="w-5 h-5 text-orange-400" /></div>
          <h3 className="text-lg font-semibold text-white">Reversar Movimiento</h3>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 text-xs">{(entry.client as unknown as { name: string })?.name}</span>
            <span className={cn('text-sm font-mono font-medium', entry.entry_type === 'credito' ? 'text-green-400' : 'text-red-400')}>
              {entry.entry_type === 'credito' ? '+' : '-'}{formatCurrency(entry.amount)}
            </span>
          </div>
          <p className="text-white text-sm">{entry.description}</p>
          <p className="text-slate-500 text-xs mt-1">{formatDateTime(entry.created_at)}</p>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          Se creara un movimiento opuesto ({entry.entry_type === 'credito' ? 'debito' : 'credito'}) por {formatCurrency(entry.amount)}.
        </p>
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">Motivo de la reversa *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Ej: Error en el monto, duplicado..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition">Cancelar</button>
          <button onClick={() => { if (reason.trim()) onConfirm(reason); }} disabled={!reason.trim()}
            className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">Confirmar Reversa</button>
        </div>
      </div>
    </div>
  );
}

function LedgerEntryModal({ clients, onClose, onSave }: { clients: B2BClient[]; onClose: () => void; onSave: () => void }) {
  const [clientId, setClientId] = useState('');
  const [entryType, setEntryType] = useState<LedgerEntryType>('debito');
  const [category, setCategory] = useState<LedgerEntryCategory>('entrega');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const creditCategories: LedgerEntryCategory[] = ['deposito_verificado', 'ajuste_credito'];
  const debitCategories: LedgerEntryCategory[] = ['entrega', 'comision', 'ajuste_debito'];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Nuevo Movimiento</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Cliente *</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Seleccionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tipo *</label>
              <select value={entryType} onChange={e => { const t = e.target.value as LedgerEntryType; setEntryType(t); setCategory(t === 'credito' ? 'deposito_verificado' : 'entrega'); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="credito">Credito</option>
                <option value="debito">Debito</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Categoria *</label>
              <select value={category} onChange={e => setCategory(e.target.value as LedgerEntryCategory)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {(entryType === 'credito' ? creditCategories : debitCategories).map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Monto *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Descripcion *</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Entrega efectivo, Comision marzo..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Motivo (para ajustes)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>
          <button onClick={handleSave} disabled={saving || !clientId || !amount || !description}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {saving ? 'Registrando...' : 'Registrar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}
