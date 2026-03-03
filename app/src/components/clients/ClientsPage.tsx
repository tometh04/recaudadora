'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS } from '@/lib/demo-data';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Phone,
  Mail,
  X,
  Building2,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { B2BClient, ClientPhone } from '@/types/database';

// Hardcoded demo phone mappings keyed by client id
const DEMO_PHONES: Record<string, ClientPhone[]> = {
  'client-1': [
    {
      id: 'ph-1',
      client_id: 'client-1',
      phone_number: '+5493415551001',
      label: null,
      is_active: true,
      created_at: '2025-01-20T10:00:00Z',
    },
    {
      id: 'ph-2',
      client_id: 'client-1',
      phone_number: '+5493415551002',
      label: null,
      is_active: true,
      created_at: '2025-01-20T10:00:00Z',
    },
  ],
  'client-2': [
    {
      id: 'ph-3',
      client_id: 'client-2',
      phone_number: '+5493415552002',
      label: null,
      is_active: true,
      created_at: '2025-02-01T10:00:00Z',
    },
  ],
  'client-3': [
    {
      id: 'ph-4',
      client_id: 'client-3',
      phone_number: '+5493415553003',
      label: null,
      is_active: true,
      created_at: '2025-02-15T10:00:00Z',
    },
  ],
  'client-4': [
    {
      id: 'ph-5',
      client_id: 'client-4',
      phone_number: '+5493415554004',
      label: null,
      is_active: true,
      created_at: '2025-03-01T10:00:00Z',
    },
  ],
};

export default function ClientsPage() {
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [phones, setPhones] = useState<Record<string, ClientPhone[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<B2BClient | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

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
      supabase
        .from('b2b_clients')
        .select('*')
        .order('name', { ascending: true }),
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Clientes B2B
          </h1>
          <p className="text-slate-400 mt-1">
            Mutuales y empresas ({clients.length})
          </p>
        </div>
        <button
          onClick={() => {
            setEditingClient(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nombre, razón social, CUIT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Client Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay clientes registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div
              key={client.id}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{client.name}</h3>
                  {client.business_name && (
                    <p className="text-slate-500 text-xs">
                      {client.business_name}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingClient(client);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {client.tax_id && (
                <p className="text-slate-400 text-xs mb-2">
                  CUIT: {client.tax_id}
                </p>
              )}

              <div className="space-y-1 mb-3">
                {client.contact_email && (
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {client.contact_email}
                  </p>
                )}
                {client.contact_phone && (
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {client.contact_phone}
                  </p>
                )}
              </div>

              {/* WhatsApp Phones */}
              {phones[client.id] && phones[client.id].length > 0 && (
                <div className="border-t border-slate-800 pt-3 mt-3">
                  <p className="text-slate-500 text-xs mb-1.5">
                    Teléfonos WhatsApp:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {phones[client.id].map((p) => (
                      <span
                        key={p.id}
                        className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs"
                      >
                        {p.phone_number}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-800 pt-3 mt-3 flex justify-between">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    client.is_active
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {client.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <span className="text-xs text-slate-600">
                  {formatDate(client.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ClientFormModal
          client={editingClient}
          existingPhones={editingClient ? phones[editingClient.id] || [] : []}
          onClose={() => {
            setShowForm(false);
            setEditingClient(null);
          }}
          onSave={() => {
            setShowForm(false);
            setEditingClient(null);
            loadClients();
          }}
        />
      )}
    </div>
  );
}

function ClientFormModal({
  client,
  existingPhones,
  onClose,
  onSave,
}: {
  client: B2BClient | null;
  existingPhones: ClientPhone[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(client?.name || '');
  const [businessName, setBusinessName] = useState(
    client?.business_name || ''
  );
  const [taxId, setTaxId] = useState(client?.tax_id || '');
  const [email, setEmail] = useState(client?.contact_email || '');
  const [phone, setPhone] = useState(client?.contact_phone || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [waPhones, setWaPhones] = useState<string[]>(
    existingPhones.map((p) => p.phone_number)
  );
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    if (isDemoMode()) {
      // In demo mode just close the modal — no persistence
      setSaving(false);
      onSave();
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const data = {
      name,
      business_name: businessName || null,
      tax_id: taxId || null,
      contact_email: email || null,
      contact_phone: phone || null,
      notes: notes || null,
    };

    let clientId = client?.id;

    if (client) {
      await supabase.from('b2b_clients').update(data).eq('id', client.id);
    } else {
      const { data: newClient } = await supabase
        .from('b2b_clients')
        .insert(data)
        .select()
        .single();
      clientId = newClient?.id;
    }

    if (clientId) {
      await supabase.from('client_phones').delete().eq('client_id', clientId);
      if (waPhones.length > 0) {
        await supabase.from('client_phones').insert(
          waPhones.map((p) => ({
            client_id: clientId,
            phone_number: p,
          }))
        );
      }
    }

    setSaving(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {client ? 'Editar Cliente' : 'Nuevo Cliente'}
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
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Razón Social
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">CUIT</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Teléfono
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* WhatsApp phones */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Teléfonos WhatsApp (mapeo automático)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+5493411234567"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPhone.trim()) {
                    setWaPhones([...waPhones, newPhone.trim()]);
                    setNewPhone('');
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newPhone.trim()) {
                    setWaPhones([...waPhones, newPhone.trim()]);
                    setNewPhone('');
                  }
                }}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {waPhones.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs"
                >
                  {p}
                  <button
                    onClick={() =>
                      setWaPhones(waPhones.filter((_, j) => j !== i))
                    }
                    className="hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {saving ? 'Guardando...' : client ? 'Actualizar' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
