'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_PROFILE } from '@/lib/demo-data';
import { ROLE_LABELS } from '@/lib/utils';
import CommissionRulesPanel from './CommissionRulesPanel';
import {
  Settings,
  Building2,
  Percent,
  Bell,
  Users,
  Save,
  Pencil,
} from 'lucide-react';
import type { Profile, UserRole } from '@/types/database';

type Tab = 'general' | 'comisiones' | 'notificaciones' | 'usuarios';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'comisiones', label: 'Comisiones', icon: Percent },
  { key: 'notificaciones', label: 'Notificaciones', icon: Bell },
  { key: 'usuarios', label: 'Usuarios', icon: Users },
];

const DEMO_USERS: Profile[] = [
  DEMO_PROFILE,
  { id: 'demo-user-2', full_name: 'Maria Contable', role: 'contable', is_active: true, created_at: '2025-02-01T10:00:00Z', updated_at: '2025-02-01T10:00:00Z' },
  { id: 'demo-user-3', full_name: 'Juan Vendedor', role: 'vendedor', is_active: true, created_at: '2025-02-15T10:00:00Z', updated_at: '2025-02-15T10:00:00Z' },
  { id: 'demo-user-4', full_name: 'Carlos Operativo', role: 'operativo', is_active: false, created_at: '2025-03-01T10:00:00Z', updated_at: '2025-03-01T10:00:00Z' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [companyName, setCompanyName] = useState('Gestion Integral');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [defaultCurrency, setDefaultCurrency] = useState('ARS');
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyVerified, setNotifyVerified] = useState(true);
  const [notifyRejected, setNotifyRejected] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('operativo');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    if (isDemoMode()) {
      setCompanyName('Financiera Demo');
      setUsers(DEMO_USERS);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase.from('system_config').select('key, value'),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    const configs = (configRes.data || []) as { key: string; value: Record<string, unknown> }[];
    for (const c of configs) {
      if (c.key === 'company_name' && typeof c.value === 'object' && 'value' in c.value) {
        setCompanyName(c.value.value as string);
      }
      if (c.key === 'timezone' && typeof c.value === 'object' && 'value' in c.value) {
        setTimezone(c.value.value as string);
      }
      if (c.key === 'default_currency' && typeof c.value === 'object' && 'value' in c.value) {
        setDefaultCurrency(c.value.value as string);
      }
      if (c.key === 'realtime_enabled' && typeof c.value === 'object' && 'value' in c.value) {
        setRealtimeEnabled(c.value.value as boolean);
      }
    }

    setUsers((usersRes.data as Profile[]) || []);
    setLoading(false);
  }

  async function saveGeneral() {
    setSaving(true);

    if (isDemoMode()) {
      setSaving(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const configs = [
      { key: 'company_name', value: { value: companyName } },
      { key: 'timezone', value: { value: timezone } },
      { key: 'default_currency', value: { value: defaultCurrency } },
    ];

    for (const c of configs) {
      await supabase.from('system_config').upsert({
        key: c.key,
        value: c.value,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    }

    setSaving(false);
  }

  async function saveNotifications() {
    setSaving(true);

    if (!isDemoMode()) {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('system_config').upsert({
        key: 'realtime_enabled',
        value: { value: realtimeEnabled },
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    }

    setSaving(false);
  }

  async function updateUserRole(userId: string, role: UserRole) {
    if (isDemoMode()) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      setEditingUser(null);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('profiles').update({ role }).eq('id', userId);
    setEditingUser(null);
    loadSettings();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-400" />
          Configuracion
        </h1>
        <p className="text-slate-400 mt-1">Parametros del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/50 border border-slate-800 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        {activeTab === 'general' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nombre de la empresa</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Moneda por defecto</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ARS">ARS (Peso Argentino)</option>
                <option value="USD">USD (Dolar Estadounidense)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="America/Argentina/Buenos_Aires">Buenos Aires (ART)</option>
                <option value="America/Sao_Paulo">Sao Paulo (BRT)</option>
                <option value="America/New_York">New York (EST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <button
              onClick={saveGeneral}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
          </div>
        )}

        {activeTab === 'comisiones' && <CommissionRulesPanel />}

        {activeTab === 'notificaciones' && (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-white text-sm font-medium">Notificaciones en tiempo real</p>
                <p className="text-xs text-slate-500">Recibir toasts cuando ocurran eventos</p>
              </div>
              <button
                onClick={() => setRealtimeEnabled(!realtimeEnabled)}
                className={`relative w-11 h-6 rounded-full transition ${realtimeEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${realtimeEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-white text-sm">Nuevos comprobantes</p>
              </div>
              <button
                onClick={() => setNotifyNew(!notifyNew)}
                className={`relative w-11 h-6 rounded-full transition ${notifyNew ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${notifyNew ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-white text-sm">Verificaciones</p>
              </div>
              <button
                onClick={() => setNotifyVerified(!notifyVerified)}
                className={`relative w-11 h-6 rounded-full transition ${notifyVerified ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${notifyVerified ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-white text-sm">Rechazos</p>
              </div>
              <button
                onClick={() => setNotifyRejected(!notifyRejected)}
                className={`relative w-11 h-6 rounded-full transition ${notifyRejected ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${notifyRejected ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <button
              onClick={saveNotifications}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
          </div>
        )}

        {activeTab === 'usuarios' && (
          <div>
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400 text-xs">
                    <th className="text-left px-4 py-2.5">Nombre</th>
                    <th className="text-left px-4 py-2.5">Rol</th>
                    <th className="text-center px-4 py-2.5">Estado</th>
                    <th className="text-right px-4 py-2.5">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 text-white font-medium">{u.full_name}</td>
                      <td className="px-4 py-3">
                        {editingUser?.id === u.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as UserRole)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                            >
                              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => updateUserRole(u.id, editRole)}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="px-2 py-1 bg-slate-700 text-white text-xs rounded"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole(u.role);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
