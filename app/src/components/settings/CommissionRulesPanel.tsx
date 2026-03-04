'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS } from '@/lib/demo-data';
import { formatCurrency } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  Percent,
  DollarSign,
  Save,
  X,
} from 'lucide-react';

interface CommissionRule {
  id: string;
  client_id: string | null;
  percentage: number;
  fixed_fee: number;
  min_amount: number;
  max_amount: number | null;
  is_active: boolean;
  created_at: string;
  client?: { name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

const DEMO_RULES: CommissionRule[] = [
  {
    id: 'rule-1',
    client_id: null,
    percentage: 1.5,
    fixed_fee: 0,
    min_amount: 0,
    max_amount: null,
    is_active: true,
    created_at: new Date().toISOString(),
    client: null,
  },
  {
    id: 'rule-2',
    client_id: 'client-1',
    percentage: 1.0,
    fixed_fee: 500,
    min_amount: 10000,
    max_amount: null,
    is_active: true,
    created_at: new Date().toISOString(),
    client: { name: 'Mutual Rosario' },
  },
];

export default function CommissionRulesPanel() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    percentage: '1.00',
    fixed_fee: '0',
    min_amount: '0',
    max_amount: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    if (isDemoMode()) {
      setRules(DEMO_RULES);
      setClients(DEMO_CLIENTS.map((c) => ({ id: c.id, name: c.name })));
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const [rulesRes, clientsRes] = await Promise.all([
      supabase.from('commission_rules').select('*, client:b2b_clients(name)').order('created_at', { ascending: false }),
      supabase.from('b2b_clients').select('id, name').eq('is_active', true).order('name'),
    ]);
    setRules((rulesRes.data as CommissionRule[]) || []);
    setClients((clientsRes.data as ClientOption[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ client_id: '', percentage: '1.00', fixed_fee: '0', min_amount: '0', max_amount: '' });
    setShowForm(true);
  }

  function openEdit(rule: CommissionRule) {
    setEditing(rule);
    setForm({
      client_id: rule.client_id || '',
      percentage: rule.percentage.toString(),
      fixed_fee: rule.fixed_fee.toString(),
      min_amount: rule.min_amount.toString(),
      max_amount: rule.max_amount?.toString() || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    const data = {
      client_id: form.client_id || null,
      percentage: parseFloat(form.percentage) || 1,
      fixed_fee: parseFloat(form.fixed_fee) || 0,
      min_amount: parseFloat(form.min_amount) || 0,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      is_active: true,
    };

    if (isDemoMode()) {
      if (editing) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  ...data,
                  client: data.client_id
                    ? { name: clients.find((c) => c.id === data.client_id)?.name || '' }
                    : null,
                }
              : r
          )
        );
      } else {
        const newRule: CommissionRule = {
          id: `rule-${Date.now()}`,
          ...data,
          created_at: new Date().toISOString(),
          client: data.client_id
            ? { name: clients.find((c) => c.id === data.client_id)?.name || '' }
            : null,
        };
        setRules((prev) => [newRule, ...prev]);
      }
      setShowForm(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    if (editing) {
      await supabase.from('commission_rules').update(data).eq('id', editing.id);
    } else {
      await supabase.from('commission_rules').insert(data);
    }
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar esta regla de comision?')) return;
    if (isDemoMode()) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('commission_rules').delete().eq('id', id);
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Percent className="w-4 h-4 text-yellow-400" />
            Reglas de Comision
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Comision general (sin cliente) aplica como default. Reglas por cliente tienen prioridad.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Nueva Regla
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cliente (vacio = general)</label>
              <select
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">-- General (todos) --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Porcentaje (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fee fijo ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.fixed_fee}
                onChange={(e) => setForm({ ...form, fixed_fee: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Monto minimo</label>
              <input
                type="number"
                step="0.01"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition"
            >
              <Save className="w-4 h-4" />
              {editing ? 'Actualizar' : 'Crear'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Rules table */}
      {rules.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">
          No hay reglas de comision configuradas
        </p>
      ) : (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs">
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-right px-4 py-2.5">Porcentaje</th>
                <th className="text-right px-4 py-2.5">Fee Fijo</th>
                <th className="text-right px-4 py-2.5">Min. Monto</th>
                <th className="text-center px-4 py-2.5">Estado</th>
                <th className="text-right px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3 text-white">
                    {rule.client?.name || (
                      <span className="text-slate-400 italic flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        General (todos)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400 font-medium">{rule.percentage}%</td>
                  <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(rule.fixed_fee)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(rule.min_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${rule.is_active ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                      {rule.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
