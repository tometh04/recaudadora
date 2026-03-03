'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_ACCOUNTS } from '@/lib/demo-data';
import { Landmark, Plus, Search, Edit2, X } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { Account, AccountType } from '@/types/database';

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

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);

    if (isDemoMode()) {
      setAccounts(DEMO_ACCOUNTS);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('name', { ascending: true });
    setAccounts((data as Account[]) || []);
    setLoading(false);
  }

  const filtered = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.cbu?.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark className="w-6 h-6 text-blue-400" />
            Cuentas / Canales
          </h1>
          <p className="text-slate-400 mt-1">
            Bancos, billeteras y proveedores ({accounts.length})
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Nueva cuenta
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nombre, banco, CBU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Accounts Grid */}
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
          {filtered.map((account) => (
            <div
              key={account.id}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{account.name}</h3>
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded text-xs font-medium mt-1',
                      ACCOUNT_TYPE_COLORS[account.account_type]
                    )}
                  >
                    {ACCOUNT_TYPE_LABELS[account.account_type]}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {account.bank_name && (
                <p className="text-slate-400 text-sm mb-1">
                  {account.bank_name}
                </p>
              )}
              {account.cbu && (
                <p className="text-slate-500 text-xs font-mono mb-1">
                  CBU: {account.cbu}
                </p>
              )}
              {account.alias && (
                <p className="text-slate-500 text-xs mb-1">
                  Alias: {account.alias}
                </p>
              )}
              {account.notes && (
                <p className="text-slate-600 text-xs mt-2">{account.notes}</p>
              )}

              <div className="border-t border-slate-800 pt-3 mt-3 flex justify-between">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    account.is_active
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {account.is_active ? 'Activa' : 'Inactiva'}
                </span>
                <span className="text-xs text-slate-600">
                  {formatDate(account.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <AccountFormModal
          account={editingAccount}
          onClose={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
          onSave={() => {
            setShowForm(false);
            setEditingAccount(null);
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}

function AccountFormModal({
  account,
  onClose,
  onSave,
}: {
  account: Account | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<AccountType>(
    account?.account_type || 'banco'
  );
  const [bankName, setBankName] = useState(account?.bank_name || '');
  const [accountNumber, setAccountNumber] = useState(
    account?.account_number || ''
  );
  const [cbu, setCbu] = useState(account?.cbu || '');
  const [alias, setAlias] = useState(account?.alias || '');
  const [notes, setNotes] = useState(account?.notes || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    if (isDemoMode()) {
      setSaving(false);
      onSave();
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const data = {
      name,
      account_type: accountType,
      bank_name: bankName || null,
      account_number: accountNumber || null,
      cbu: cbu || null,
      alias: alias || null,
      notes: notes || null,
    };

    if (account) {
      await supabase.from('accounts').update(data).eq('id', account.id);
    } else {
      await supabase.from('accounts').insert(data);
    }

    setSaving(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {account ? 'Editar Cuenta' : 'Nueva Cuenta'}
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
              Nombre interno *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Macro Pesos, MercadoPago..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Tipo *</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="banco">Banco</option>
              <option value="billetera">Billetera Virtual</option>
              <option value="proveedor_saldo_virtual">
                Proveedor Saldo Virtual
              </option>
            </select>
          </div>

          {accountType === 'banco' && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Banco
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Banco Macro, Credicoop..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Nro. Cuenta
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    CBU
                  </label>
                  <input
                    type="text"
                    value={cbu}
                    onChange={(e) => setCbu(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Alias
                </label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {saving
              ? 'Guardando...'
              : account
                ? 'Actualizar'
                : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}
