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
} from 'lucide-react';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import type {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryCategory,
  B2BClient,
  ClientBalance,
} from '@/types/database';

const CATEGORY_LABELS: Record<LedgerEntryCategory, string> = {
  deposito_verificado: 'Depósito Verificado',
  entrega: 'Entrega',
  comision: 'Comisión',
  ajuste_credito: 'Ajuste Crédito',
  ajuste_debito: 'Ajuste Débito',
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    if (isDemoMode()) {
      setEntries(DEMO_LEDGER);
      setClients(DEMO_CLIENTS.filter((c) => c.is_active));
      setBalances(DEMO_CLIENT_BALANCES);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [entriesRes, clientsRes, balancesRes] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('*, client:b2b_clients(name), creator:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('b2b_clients')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase.from('v_client_balances').select('*'),
    ]);
    setEntries((entriesRes.data as LedgerEntry[]) || []);
    setClients((clientsRes.data as B2BClient[]) || []);
    setBalances((balancesRes.data as ClientBalance[]) || []);
    setLoading(false);
  }

  const filtered = entries.filter((e) => {
    if (selectedClient !== 'todos' && e.client_id !== selectedClient)
      return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.client as unknown as { name: string })?.name
          ?.toLowerCase()
          .includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            Cuenta Corriente
          </h1>
          <p className="text-slate-400 mt-1">
            Ledger auditable por cliente B2B
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo movimiento
        </button>
      </div>

      {/* Balances Summary */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {balances.slice(0, 8).map((b) => (
            <div
              key={b.client_id}
              onClick={() => setSelectedClient(b.client_id)}
              className={cn(
                'p-4 rounded-xl border cursor-pointer transition',
                selectedClient === b.client_id
                  ? 'bg-emerald-900/20 border-emerald-700'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              )}
            >
              <p className="text-sm text-slate-400 truncate">{b.client_name}</p>
              <p
                className={cn(
                  'text-lg font-bold mt-1',
                  b.saldo >= 0 ? 'text-green-400' : 'text-red-400'
                )}
              >
                {formatCurrency(b.saldo)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="todos">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por descripción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left p-4 text-slate-400 font-medium">
                  Fecha
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Cliente
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Tipo
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Categoría
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Descripción
                </th>
                <th className="text-right p-4 text-slate-400 font-medium">
                  Monto
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Usuario
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No hay movimientos
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="p-4 text-slate-300 text-xs whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="p-4 text-white">
                      {(entry.client as unknown as { name: string })?.name}
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1">
                        {entry.entry_type === 'credito' ? (
                          <ArrowUpCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <ArrowDownCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span
                          className={
                            entry.entry_type === 'credito'
                              ? 'text-green-400'
                              : 'text-red-400'
                          }
                        >
                          {entry.entry_type === 'credito'
                            ? 'Crédito'
                            : 'Débito'}
                        </span>
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs">
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300 max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td
                      className={cn(
                        'p-4 text-right font-mono font-medium',
                        entry.entry_type === 'credito'
                          ? 'text-green-400'
                          : 'text-red-400'
                      )}
                    >
                      {entry.entry_type === 'credito' ? '+' : '-'}
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="p-4 text-slate-500 text-xs">
                      {
                        (entry.creator as unknown as { full_name: string })
                          ?.full_name
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Entry Modal */}
      {showForm && (
        <LedgerEntryModal
          clients={clients}
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function LedgerEntryModal({
  clients,
  onClose,
  onSave,
}: {
  clients: B2BClient[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [entryType, setEntryType] = useState<LedgerEntryType>('debito');
  const [category, setCategory] = useState<LedgerEntryCategory>('entrega');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const creditCategories: LedgerEntryCategory[] = [
    'deposito_verificado',
    'ajuste_credito',
  ];
  const debitCategories: LedgerEntryCategory[] = [
    'entrega',
    'comision',
    'ajuste_debito',
  ];

  async function handleSave() {
    if (!clientId || !amount || !description) return;
    setSaving(true);

    if (isDemoMode()) {
      setSaving(false);
      onSave();
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('ledger_entries').insert({
      client_id: clientId,
      entry_type: entryType,
      category,
      amount: parseFloat(amount),
      description,
      reason: reason || null,
      created_by: user?.id,
    });

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'ledger_entry_created',
      entity_type: 'ledger_entries',
      after_data: { client_id: clientId, entry_type: entryType, amount },
    });

    setSaving(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            Nuevo Movimiento
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Cliente *
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Tipo *
              </label>
              <select
                value={entryType}
                onChange={(e) => {
                  const t = e.target.value as LedgerEntryType;
                  setEntryType(t);
                  setCategory(
                    t === 'credito' ? 'deposito_verificado' : 'entrega'
                  );
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Categoría *
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as LedgerEntryCategory)
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {(entryType === 'credito'
                  ? creditCategories
                  : debitCategories
                ).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Monto *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Descripción *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Entrega efectivo, Comisión marzo..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Motivo (para ajustes)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !clientId || !amount || !description}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {saving ? 'Registrando...' : 'Registrar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}
